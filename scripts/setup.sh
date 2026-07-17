#!/usr/bin/env bash
#
# A-Chad one-shot installer — backend + frontend + all models.
#
#   bash scripts/setup.sh
#
# Runs in Git Bash on Windows (and macOS/Linux). Does everything needed to go
# from a fresh `git clone` to a runnable stack:
#   1. checks prerequisites (Node, Python 3.12, Ollama)
#   2. npm install (web + api + workspaces)
#   3. creates Python venvs and pip-installs docproc + stt
#   4. downloads all models into ./models  (faster-whisper, docling, EasyOCR)
#   5. pulls the Ollama models (embeddings + chat LLM)
#
# Idempotent: anything already present is skipped. Needs network the first time
# (or an internal npm/PyPI mirror). If you already extracted an offline model
# bundle into ./models, the download steps auto-skip.
#
# Flags:
#   --skip-deps     skip npm/pip install
#   --skip-models   skip HF/EasyOCR model downloads
#   --skip-ollama   skip `ollama pull`
#   --chat-model X  Ollama chat model to pull (default: gemma4)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- config / flags ---------------------------------------------------------
SKIP_DEPS=0; SKIP_MODELS=0; SKIP_OLLAMA=0
CHAT_MODEL="${DEFAULT_MODEL:-gemma4}"
EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"
STT_MODEL="${STT_MODEL:-large-v3}"
export HF_HOME="$REPO_ROOT/models"
EASYOCR_DIR="$REPO_ROOT/models/easyocr"

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-deps)    SKIP_DEPS=1 ;;
    --skip-models)  SKIP_MODELS=1 ;;
    --skip-ollama)  SKIP_OLLAMA=1 ;;
    --chat-model)   CHAT_MODEL="$2"; shift ;;
    -h|--help)      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# --- Python 3.12 discovery (Windows py launcher, pyenv, or PATH) -------------
find_py312() {
  local p
  p="$(ls -d "$(pyenv root 2>/dev/null)"/versions/3.12.* 2>/dev/null | head -1)/bin/python"
  [ -x "$p" ] && { PY_CMD=("$p"); return 0; }
  for p in "/c/Program Files/Python312/python.exe" "/c/Program Files/Python312/python3.exe"; do
    [ -x "$p" ] && { PY_CMD=("$p"); return 0; }
  done
  if command -v py >/dev/null 2>&1 && py -3.12 -c "" >/dev/null 2>&1; then
    PY_CMD=(py -3.12); return 0
  fi
  command -v python3.12 >/dev/null 2>&1 && { PY_CMD=(python3.12); return 0; }
  return 1
}

# venv python path differs by OS (Windows: Scripts/, POSIX: bin/).
venv_python() {
  local d="$1"
  if [ -x "$d/.venv/Scripts/python.exe" ]; then echo "$d/.venv/Scripts/python.exe"
  elif [ -x "$d/.venv/bin/python" ]; then echo "$d/.venv/bin/python"
  else return 1; fi
}

# =============================================================================
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js >= 20 not found. Install from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || die "npm not found (comes with Node.js)."
info "node $(node --version), npm $(npm --version)"
if find_py312; then info "python 3.12: ${PY_CMD[*]}"; else
  die "Python 3.12 not found. Install it (Windows: python.org; or 'pyenv install 3.12')."
fi
if command -v ollama >/dev/null 2>&1; then info "ollama: present"; else
  warn "ollama not found — chat + RAG embeddings need it. Install from https://ollama.com"
fi

# =============================================================================
if [ "$SKIP_DEPS" = "0" ]; then
  step "Installing JavaScript dependencies (npm install)"
  npm install

  for svc in docproc stt; do
    step "Setting up Python venv: services/$svc"
    ( cd "services/$svc"
      if ! venv_python "." >/dev/null 2>&1; then
        info "creating venv with ${PY_CMD[*]}"
        "${PY_CMD[@]}" -m venv .venv
      fi
      VP="$(venv_python ".")"
      "$VP" -m pip install -q --upgrade pip
      "$VP" -m pip install -q -r requirements.txt
      info "$svc dependencies installed"
    )
  done
else
  info "(skipping dependency install)"
fi

# =============================================================================
if [ "$SKIP_MODELS" = "0" ]; then
  DOCPROC_PY="$(venv_python "services/docproc")" || die "docproc venv missing — run without --skip-deps first."
  STT_PY="$(venv_python "services/stt")"          || die "stt venv missing — run without --skip-deps first."

  step "Downloading STT model (faster-whisper: $STT_MODEL) → models/hub"
  if ls -d "models/hub/models--Systran--faster-whisper-$STT_MODEL" >/dev/null 2>&1; then
    info "already present — skipping"
  else
    HF_HOME="$HF_HOME" "$STT_PY" - "$STT_MODEL" <<'PY'
import sys
from faster_whisper import download_model
download_model(sys.argv[1])
print("    faster-whisper downloaded")
PY
  fi

  step "Downloading document models (Docling layout + tableformer) → models/hub"
  if ls -d "models/hub/models--ds4sd--docling-models" >/dev/null 2>&1; then
    info "already present — skipping"
  else
    HF_HOME="$HF_HOME" "$DOCPROC_PY" - <<'PY'
from docling.utils.model_downloader import download_models
download_models(with_easyocr=False, progress=True)
print("    docling models downloaded")
PY
  fi

  step "Downloading OCR models (EasyOCR) → models/easyocr"
  if ls "$EASYOCR_DIR"/*.pth >/dev/null 2>&1; then
    info "already present — skipping"
  else
    mkdir -p "$EASYOCR_DIR"
    EASYOCR_DIR="$EASYOCR_DIR" "$DOCPROC_PY" - <<'PY'
import os
import easyocr
from docling.datamodel.pipeline_options import EasyOcrOptions
d = os.environ["EASYOCR_DIR"]
# Docling's default OCR languages (map to the latin recognition model).
easyocr.Reader(EasyOcrOptions().lang, model_storage_directory=d,
               download_enabled=True, gpu=False, verbose=False)
print("    EasyOCR models downloaded to", d)
PY
  fi
else
  info "(skipping model downloads)"
fi

# =============================================================================
if [ "$SKIP_OLLAMA" = "0" ] && command -v ollama >/dev/null 2>&1; then
  step "Pulling Ollama embedding model: $EMBED_MODEL"
  ollama pull "$EMBED_MODEL"
  step "Pulling Ollama chat model: $CHAT_MODEL"
  ollama pull "$CHAT_MODEL" || warn "could not pull '$CHAT_MODEL' — pull one manually and/or set DEFAULT_MODEL."
elif [ "$SKIP_OLLAMA" = "0" ]; then
  warn "ollama not installed — skipped model pulls. Install Ollama, then:"
  warn "    ollama pull $EMBED_MODEL && ollama pull $CHAT_MODEL"
fi

# =============================================================================
step "Done ✅"
cat <<EOF

    Start everything with:
        npm run dev

    Services: web :5173 · api :8787 · docproc :8801 · stt :8802
    Ollama (LLM + embeddings) must be running: ollama serve

    Note: DEFAULT_MODEL defaults to 'gemma4:26b' in apps/api/src/agent/registry.ts.
    If you pulled a different tag, set it:  DEFAULT_MODEL=$CHAT_MODEL npm run dev
EOF
