# A-Chad STT (Meta MMS — no OpenAI/Whisper). CPU image by default; for GPU use
# an nvidia/cuda base + STT_DEVICE=cuda and a CUDA torch wheel.
FROM python:3.12-slim

WORKDIR /app

# ffmpeg/libsndfile for decoding mp3/m4a/wav/ogg, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV STT_DEVICE=cpu \
    STT_LID_MODEL=facebook/mms-lid-256 \
    STT_ASR_MODEL=facebook/seamless-m4t-v2-large \
    HF_HOME=/models

# Optional: pre-download weights at build time (large; uncomment for offline /
# faster first request):
# RUN python -c "from transformers import AutoFeatureExtractor, AutoProcessor, Wav2Vec2ForCTC, Wav2Vec2ForSequenceClassification; \
#   AutoFeatureExtractor.from_pretrained('facebook/mms-lid-256'); \
#   Wav2Vec2ForSequenceClassification.from_pretrained('facebook/mms-lid-256'); \
#   AutoProcessor.from_pretrained('facebook/mms-1b-all'); \
#   Wav2Vec2ForCTC.from_pretrained('facebook/mms-1b-all')"

EXPOSE 8802
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8802"]
