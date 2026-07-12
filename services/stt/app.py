"""A-Chad speech-to-text service — faster-whisper + RTX 4090.

Uses faster-whisper (CTranslate2, float16 on CUDA) for near-real-time
transcription. Auto language detection, built-in VAD, ~100 languages.
No OpenAI. Fully local.

Contract matches apps/api/src/clients/stt.ts:

    POST /transcribe  (multipart "file", optional form "language")
      -> NDJSON stream:
           {"t":"lang","v":"spa"}
           {"t":"partial","v":"<segment>","i":1,"n":0}
           ...
           {"t":"done","text":"<full transcript>","language":"spa"}
"""

# Use the OS trust store (Windows/macOS/Linux) for TLS so corporate
# CA-signed certs from TLS-inspection proxies are trusted. Must run before
# any HTTPS request (e.g. HuggingFace weight downloads).
import truststore

truststore.inject_into_ssl()

import io
import json
import os
import time

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

# --- Config (override via env vars) ---
MODEL_SIZE    = os.environ.get("STT_MODEL",        "large-v3")
DEVICE        = os.environ.get("STT_DEVICE",       "cuda")
COMPUTE_TYPE  = os.environ.get("STT_COMPUTE_TYPE", "float16")  # float16 for 4090
BEAM_SIZE     = int(os.environ.get("STT_BEAM_SIZE", "5"))

app = FastAPI(title="A-Chad STT (faster-whisper)")

print(f"[stt] Loading {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})…", flush=True)
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
print("[stt] Model ready.", flush=True)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
):
    """Streams NDJSON so the caller can show live progress as each segment arrives."""
    data = await file.read()

    def gen():
        t_start = time.time()
        parts: list[str] = []
        i = 0
        lang_emitted = False

        segments, info = model.transcribe(
            io.BytesIO(data),
            language=language or None,   # None = auto-detect
            beam_size=BEAM_SIZE,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            word_timestamps=False,
        )

        lang = language or info.language

        for segment in segments:
            # Emit language on the very first segment (info.language is ready by then)
            if not lang_emitted:
                print(
                    f"[stt] {file.filename}: lang={lang}, "
                    f"duration={info.duration:.0f}s",
                    flush=True,
                )
                yield json.dumps({"t": "lang", "v": lang}) + "\n"
                lang_emitted = True

            text = segment.text.strip()
            if not text:
                continue
            i += 1
            parts.append(text)
            seg_dur = segment.end - segment.start
            print(
                f"[stt]   seg {i}: [{segment.start:.1f}s→{segment.end:.1f}s]"
                f" ({seg_dur:.0f}s) {text[:80]}",
                flush=True,
            )
            yield json.dumps({"t": "partial", "v": text, "i": i, "n": 0}) + "\n"

        # Fallback: if file was silent / no segments
        if not lang_emitted:
            yield json.dumps({"t": "lang", "v": lang or "unknown"}) + "\n"

        full = " ".join(parts).strip()
        elapsed = time.time() - t_start
        print(
            f"[stt] done: {len(full)} chars, {i} segments in {elapsed:.1f}s total",
            flush=True,
        )
        yield json.dumps({"t": "done", "text": full, "language": lang or "unknown"}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")
