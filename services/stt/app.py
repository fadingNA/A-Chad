"""A-Chad speech-to-text service.

**No OpenAI / no Whisper.** Uses Meta's SeamlessM4T v2 for ASR — covers ~100
languages (incl. French, Spanish, Portuguese, Chinese) with punctuation and
casing, far better quality than MMS. `mms-lid` auto-detects the spoken language
(Seamless needs the source language for faithful transcription).

Self-hosted; weights download into the container/venv. Contract matches
apps/api/src/clients/stt.ts:

    POST /transcribe  (multipart "file", optional form "language")
      -> { "text": ..., "language": ... }

NOTE: SeamlessM4T v2 large (~2.3B params, ~9GB) is heavy — it really wants a
GPU. On CPU it is slow and RAM-hungry. Set STT_ASR_MODEL=facebook/mms-1b-all to
fall back to the lighter (lower-quality) MMS engine.
"""

import io
import json
import os
import time

import librosa
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from transformers import (
    AutoFeatureExtractor,
    AutoProcessor,
    SeamlessM4Tv2Model,
    Wav2Vec2ForSequenceClassification,
)

DEVICE = os.environ.get("STT_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
LID_MODEL = os.environ.get("STT_LID_MODEL", "facebook/mms-lid-256")
ASR_MODEL = os.environ.get("STT_ASR_MODEL", "facebook/seamless-m4t-v2-large")
SAMPLE_RATE = 16000
# Seamless processes a whole clip in one pass — split long audio into windows
# to bound memory/time.
CHUNK_SEC = int(os.environ.get("STT_CHUNK_SECONDS", "20"))

# mms-lid returns ISO-639-3; normalize the few that differ from Seamless codes.
LANG_MAP = {"zho": "cmn", "chi": "cmn"}
# Restrict language detection to the languages you actually expect, so LID can't
# mis-pick a near neighbour (e.g. Spanish → English). Override via STT_LANGS;
# pass an explicit `language` per request to bypass detection entirely.
ALLOWED_LANGS = [
    c.strip() for c in os.environ.get("STT_LANGS", "fra,spa,por,cmn").split(",") if c.strip()
]

app = FastAPI(title="A-Chad STT (SeamlessM4T v2)")

# Loaded once at startup (first run downloads the weights).
lid_extractor = AutoFeatureExtractor.from_pretrained(LID_MODEL)
lid_model = Wav2Vec2ForSequenceClassification.from_pretrained(LID_MODEL).to(DEVICE)
asr_processor = AutoProcessor.from_pretrained(ASR_MODEL)
asr_model = SeamlessM4Tv2Model.from_pretrained(ASR_MODEL).to(DEVICE)

# Silero VAD (MIT, no OpenAI) — split audio at natural silences so chunks hold
# whole utterances (no mid-word cuts) and non-speech is skipped. Optional: falls
# back to fixed windows if it can't load.
try:
    from silero_vad import get_speech_timestamps, load_silero_vad

    vad_model = load_silero_vad()
except Exception:  # noqa: BLE001
    vad_model = None
    get_speech_timestamps = None


def detect_language(audio) -> str:
    # LID on a leading slice — enough to identify the language, cheap on long clips.
    sample = audio[: SAMPLE_RATE * 30]
    inputs = lid_extractor(sample, sampling_rate=SAMPLE_RATE, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        logits = lid_model(**inputs).logits[0]

    id2label = lid_model.config.id2label
    if ALLOWED_LANGS:
        label2id = {v: k for k, v in id2label.items()}
        idxs = [label2id[c] for c in ALLOWED_LANGS if c in label2id]
        if idxs:
            best = idxs[int(torch.argmax(logits[idxs]))]
            return LANG_MAP.get(id2label[best], id2label[best])

    code = id2label[int(torch.argmax(logits))]
    return LANG_MAP.get(code, code)


def _transcribe_chunk(chunk, lang: str) -> str:
    inputs = asr_processor(
        audios=chunk, sampling_rate=SAMPLE_RATE, return_tensors="pt"
    ).to(DEVICE)
    with torch.no_grad():
        tokens = asr_model.generate(**inputs, tgt_lang=lang, generate_speech=False)
    return asr_processor.decode(tokens[0].tolist()[0], skip_special_tokens=True).strip()


def _fixed_chunks(audio):
    window = SAMPLE_RATE * CHUNK_SEC
    out = []
    for start in range(0, len(audio), window):
        chunk = audio[start : start + window]
        if len(chunk) >= SAMPLE_RATE * 0.2:  # skip <0.2s tail
            out.append(chunk)
    return out


def _chunks(audio):
    """Split on speech (VAD), grouping utterances into <=CHUNK_SEC windows at
    silence boundaries. Falls back to fixed windows if VAD is unavailable."""
    if vad_model is None or get_speech_timestamps is None:
        return _fixed_chunks(audio)
    try:
        segments = get_speech_timestamps(
            torch.from_numpy(audio), vad_model, sampling_rate=SAMPLE_RATE
        )
    except Exception:  # noqa: BLE001
        return _fixed_chunks(audio)
    if not segments:
        return _fixed_chunks(audio)

    maxlen = SAMPLE_RATE * CHUNK_SEC
    out = []
    start = segments[0]["start"]
    end = segments[0]["end"]
    for seg in segments[1:]:
        if seg["end"] - start <= maxlen:
            end = seg["end"]  # extend current window to this utterance
        else:
            out.append(audio[start:end])  # break at the silence before this seg
            start, end = seg["start"], seg["end"]
    out.append(audio[start:end])
    return [c for c in out if len(c) >= SAMPLE_RATE * 0.2]


@app.get("/health")
def health():
    return {"ok": True, "lid": LID_MODEL, "asr": ASR_MODEL, "device": DEVICE}


@app.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
):
    """Streams NDJSON so the caller can show live progress:
        {"t":"lang","v":"fra"}
        {"t":"partial","v":"<chunk text>","i":1,"n":4}
        ...
        {"t":"done","text":"<full>","language":"fra"}
    """
    data = await file.read()
    audio, _ = librosa.load(io.BytesIO(data), sr=SAMPLE_RATE, mono=True)
    duration = len(audio) / SAMPLE_RATE
    lang = language or detect_language(audio)
    chunks = _chunks(audio)
    print(
        f"[stt] {file.filename}: {duration:.0f}s audio, lang={lang}, "
        f"{len(chunks)} VAD chunks",
        flush=True,
    )

    def gen():
        yield json.dumps({"t": "lang", "v": lang}) + "\n"
        parts: list[str] = []
        t_start = time.time()
        for i, chunk in enumerate(chunks):
            t_chunk = time.time()
            try:
                t = _transcribe_chunk(chunk, lang)
            except Exception as err:  # don't fail the whole file on one chunk
                t = f"[chunk error: {err}]"
            parts.append(t)
            print(
                f"[stt]   chunk {i + 1}/{len(chunks)} "
                f"({len(chunk) / SAMPLE_RATE:.0f}s) in {time.time() - t_chunk:.1f}s",
                flush=True,
            )
            yield json.dumps({"t": "partial", "v": t, "i": i + 1, "n": len(chunks)}) + "\n"
        full = " ".join(p for p in parts if p).strip()
        print(
            f"[stt] done: {len(full)} chars in {time.time() - t_start:.0f}s total",
            flush=True,
        )
        yield json.dumps({"t": "done", "text": full, "language": lang}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")
