#!/usr/bin/env bash
# Run the document-processing service (Docling) natively — no Docker.
#   bash scripts/run-docproc.sh   (or: npm run docproc)
set -euo pipefail

# Docling/torch need Python 3.12 (no wheels for 3.14). Pick a pyenv 3.12.x.
PY="$(ls -d "$(pyenv root 2>/dev/null)"/versions/3.12.* 2>/dev/null | head -1)/bin/python"
if [ ! -x "$PY" ]; then
  echo "Need Python 3.12 — install it with:  pyenv install 3.12" >&2
  exit 1
fi

cd "$(dirname "$0")/../services/docproc"

if [ ! -d .venv ]; then
  echo "Creating venv with $("$PY" --version)…"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

pip install -q --upgrade pip
pip install -q -r requirements.txt

echo "docproc → http://localhost:8801  (first run downloads Docling models)"
exec uvicorn app:app --host 0.0.0.0 --port 8801 --reload
