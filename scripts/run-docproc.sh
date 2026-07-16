#!/usr/bin/env bash
# Run the document-processing service (Docling) natively — no Docker.
#   bash scripts/run-docproc.sh   (or: npm run docproc)
#
# Runs fully OFFLINE: models are cached locally after the first download.
# To force a (re)download, run once with:  ALLOW_DOWNLOAD=1 npm run docproc
set -euo pipefail

# --- Use the repo-vendored model store by default so the whole stack is
#     self-contained (zippable, offline). Override with an explicit HF_HOME.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HF_HOME="${HF_HOME:-$REPO_ROOT/models}"

cd "$(dirname "$0")/../services/docproc"

# --- Locate a Python 3.12 interpreter (Docling/torch have no 3.13/3.14 wheels).
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

# --- Offline by default (models are cached). Opt out with ALLOW_DOWNLOAD=1.
if [ "${ALLOW_DOWNLOAD:-0}" = "1" ]; then
  echo "docproc → http://localhost:8801  (ONLINE — may download Docling models)"
else
  export HF_HUB_OFFLINE=1
  export TRANSFORMERS_OFFLINE=1
  echo "docproc → http://localhost:8801  (OFFLINE — using cached models)"
fi

mkdir -p logs
LOG_FILE="logs/$(date +%Y-%m-%d).log"
echo "[docproc] Logging to $LOG_FILE"
"$VENV_PY" -m uvicorn app:app --host 0.0.0.0 --port 8801 --reload 2>&1 | tee -a "$LOG_FILE"
