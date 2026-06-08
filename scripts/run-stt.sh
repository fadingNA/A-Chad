#!/usr/bin/env bash
# Run the speech-to-text service (Meta MMS) natively — no Docker.
#   bash scripts/run-stt.sh   (or: npm run stt)
set -euo pipefail

# torch/transformers need Python 3.12 (no wheels for 3.14). Pick a pyenv 3.12.x.
PY="$(ls -d "$(pyenv root 2>/dev/null)"/versions/3.12.* 2>/dev/null | head -1)/bin/python"
if [ ! -x "$PY" ]; then
  echo "Need Python 3.12 — install it with:  pyenv install 3.12" >&2
  exit 1
fi

# librosa needs ffmpeg to decode mp3/m4a/ogg (wav works without it).
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "WARNING: ffmpeg not found — only .wav will decode. Install:  brew install ffmpeg" >&2
fi

cd "$(dirname "$0")/../services/stt"

if [ ! -d .venv ]; then
  echo "Creating venv with $("$PY" --version)…"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

pip install -q --upgrade pip
pip install -q -r requirements.txt

echo "stt → http://localhost:8802  (first request downloads Meta MMS weights, ~4-6GB)"
exec uvicorn app:app --host 0.0.0.0 --port 8802 --reload
