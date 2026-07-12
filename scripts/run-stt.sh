#!/usr/bin/env bash
# Run the speech-to-text service (Seamless M4T v2 / MMS) natively — no Docker.
#   bash scripts/run-stt.sh   (or: npm run stt)
#
# Runs OFFLINE once the models are cached. The first run must be ONLINE to
# download the weights (~several GB); after that it stays fully local.
# Force a download anytime with:  ALLOW_DOWNLOAD=1 npm run stt
set -euo pipefail

cd "$(dirname "$0")/../services/stt"

# librosa needs ffmpeg to decode mp3/m4a/ogg (wav works without it).
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "WARNING: ffmpeg not found — only .wav will decode." >&2
fi

# --- Locate a Python 3.12 interpreter (torch/transformers have no 3.13/3.14 wheels).
#     Populates the PY_CMD array (handles paths with spaces and the py launcher).
find_py312() {
  local p
  # 1) pyenv 3.12.x
  p="$(ls -d "$(pyenv root 2>/dev/null)"/versions/3.12.* 2>/dev/null | head -1)/bin/python"
  [ -x "$p" ] && { PY_CMD=("$p"); return 0; }
  # 2) Windows system install
  for p in "/c/Program Files/Python312/python.exe" "/c/Program Files/Python312/python3.exe"; do
    [ -x "$p" ] && { PY_CMD=("$p"); return 0; }
  done
  # 3) Windows launcher
  if command -v py >/dev/null 2>&1 && py -3.12 -c "" >/dev/null 2>&1; then
    PY_CMD=(py -3.12); return 0
  fi
  # 4) POSIX
  command -v python3.12 >/dev/null 2>&1 && { PY_CMD=(python3.12); return 0; }
  return 1
}

# --- venv python path differs by OS (Windows: Scripts/, POSIX: bin/).
venv_python() {
  if [ -x .venv/Scripts/python.exe ]; then echo ".venv/Scripts/python.exe";
  elif [ -x .venv/bin/python ]; then echo ".venv/bin/python";
  else return 1; fi
}

if ! venv_python >/dev/null 2>&1; then
  if ! find_py312; then
    echo "Need Python 3.12. Install it (Windows: python.org; or 'pyenv install 3.12')." >&2
    exit 1
  fi
  echo "Creating venv with: ${PY_CMD[*]}"
  "${PY_CMD[@]}" -m venv .venv
fi

VENV_PY="$(venv_python)"
"$VENV_PY" -m pip install -q --upgrade pip
"$VENV_PY" -m pip install -q -r requirements.txt

# --- Offline only if the faster-whisper weights are already cached; otherwise allow the
#     one-time download. Force online with ALLOW_DOWNLOAD=1.
HUB="${HF_HOME:-$HOME/.cache/huggingface}/hub"
MODEL_DIR="models--Systran--faster-whisper-${STT_MODEL:-large-v3}"
if [ "${ALLOW_DOWNLOAD:-0}" != "1" ] && ls -d "$HUB/$MODEL_DIR" >/dev/null 2>&1; then
  export HF_HUB_OFFLINE=1
  export TRANSFORMERS_OFFLINE=1
  echo "stt → http://localhost:8802  (OFFLINE — using cached models)"
else
  echo "stt → http://localhost:8802  (ONLINE — first run downloads weights, ~3GB)"
fi

mkdir -p logs
LOG_FILE="logs/$(date +%Y-%m-%d).log"
echo "[stt] Logging to $LOG_FILE"
"$VENV_PY" -m uvicorn app:app --host 0.0.0.0 --port 8802 --reload 2>&1 | tee -a "$LOG_FILE"
