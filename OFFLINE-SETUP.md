# Offline / Restricted-Machine Setup

How to run A-Chad's full stack on a machine with no internet access (or a
locked-down / security-restricted Windows box). The app code comes from git;
the AI model weights are transferred separately via an offline bundle.

## Why the models aren't in git

The service model weights (~3.4 GB) are **gitignored** — they exceed GitHub's
100 MB/file hard limit and don't belong in the repo. `git clone` / `git pull`
gives you the **code**; the **weights** come from `models-offline-windows.zip`,
transferred out-of-band.

The **LLM (Ollama)** is not bundled at all — install it separately (see below).

## Offline readiness — what's handled vs. what needs a one-time bootstrap

Runtime is fully offline once set up. The scripts **do not** hit the network on
normal startup: `HF_HUB_OFFLINE` is set, OCR downloads are disabled, and
`pip install` is skipped unless the venv is new or `ALLOW_DOWNLOAD=1` /
`PIP_INSTALL=1` is passed. No CDN/font/analytics calls from the frontend.

| Piece | Offline-ready? | How |
|---|---|---|
| HF service models (STT, docling) | ✅ | `models-offline-windows.zip` → `models/hub/` |
| OCR models (EasyOCR) | ✅ | bundled in `models/easyocr/`, downloads disabled |
| Embedding model (`nomic-embed-text`) | ✅ | `ollama-nomic-embed-text.zip` |
| Chat LLM (e.g. gemma4) | ⚠️ transfer separately | `ollama pull` online, or copy the Ollama store |
| **Node deps (`node_modules`)** | ⚠️ one-time | `npm install` needs a registry — see below |
| **Python deps (venvs)** | ⚠️ one-time | `pip install` needs a registry/wheels — see below |

**Code dependencies are a supply-chain step, separate from models.** On a truly
air-gapped machine, `npm install` and the first `pip install` can't reach their
registries. Options (pick per your environment):

1. **One-time online bootstrap** — on first setup with network access (or via a
   proxy; `truststore` already trusts the OS/corporate CA), run `npm install`
   and start each Python service once (which creates the venv + installs). After
   that, everything runs offline.
2. **Internal mirror** — point npm/pip at your org's Artifactory/Nexus/PyPI
   mirror (`.npmrc` registry + `pip config`/`PIP_INDEX_URL`).
3. **Vendored deps** — transfer a prebuilt `node_modules/` and a Python wheels
   dir, then `pip install --no-index --find-links <wheels>`. Note: `node_modules`
   and venvs are **OS/arch-specific** — build them on the same platform as the
   target (a macOS venv won't run on Windows).

## What's in the offline bundle

`models-offline-windows.zip` (~1.9 GB) contains the two Python services' models,
laid out as a HuggingFace cache with **no symlinks** (so it extracts cleanly on
Windows, which normally can't create symlinks):

| Model | Size | Used by |
|---|---|---|
| `mobiuslabsgmbh/faster-whisper-large-v3-turbo` | 1.5 GB | audio / speech-to-text (`stt`) — multilingual, ~2–8× faster than large-v3 |
| `ds4sd/docling-models` | 342 MB | document processing (`docproc`) |
| `ds4sd/docling-layout-heron` | 164 MB | document processing (`docproc`) |

> For maximum accuracy over speed, set `STT_MODEL=large-v3` (re-download the 2.9 GB
> model; the run script auto-detects whichever model is cached).

Extracts to `A-Chad/models/hub/…`, which is exactly where the run scripts look
(`HF_HOME` defaults to `<repo>/models`).

It also includes **`models/easyocr/`** — the EasyOCR models Docling uses for OCR
on PDFs/scans (`craft_mlt_25k.pth` + `latin_g2.pth`, ~94 MB). docproc is pinned
to this dir with downloads disabled, so PDF text extraction works fully offline
(override the location with `EASYOCR_MODELS`).

## Prerequisites (Windows)

- [Git for Windows](https://git-scm.com/download/win) — provides **Git Bash**,
  required because the service launchers (`scripts/run-*.sh`) are bash scripts.
- Node.js >= 20
- Python 3.12 (torch / faster-whisper have no 3.13/3.14 wheels)
- [Ollama](https://ollama.com/download) — for the chat LLM (separate from this bundle)
- `ffmpeg` on PATH (optional — STT decodes non-`.wav` audio with it)

## Quick start (one command)

On a machine **with network access** (or an internal npm/PyPI/Ollama mirror), the
installer does everything — npm install, Python venvs + pip, all model downloads,
and the Ollama pulls. Run it in **Git Bash**:

```bash
git clone <your-repo-url> && cd A-Chad
bash scripts/setup.sh
npm run dev
```

It's idempotent and skips anything already present — so if you've extracted an
offline model bundle into `./models`, the download steps are skipped
automatically. Flags: `--skip-deps`, `--skip-models`, `--skip-ollama`,
`--chat-model <tag>`. For a fully **air-gapped** machine that can't reach the
registries, follow the manual steps below (using an offline bundle + mirror or
vendored deps).

## Setup steps (manual / air-gapped)

Run these in **Git Bash** from the machine.

1. **Get the code:**
   ```bash
   git clone <your-repo-url>
   cd A-Chad
   ```

2. **Transfer `models-offline-windows.zip`** onto the machine out-of-band
   (USB, internal share, or an approved transfer method).

3. **Extract at the repo root** so the layout becomes `A-Chad/models/hub/...`.
   Windows "Extract All" or 7-Zip both work (no symlinks to worry about).
   Verify:
   ```bash
   ls models/hub
   #   models--Systran--faster-whisper-large-v3
   #   models--ds4sd--docling-models
   #   models--ds4sd--docling-layout-heron
   ```

4. **Install JS deps:**
   ```bash
   npm install
   ```

5. **Install the LLM** (needs network once, or transfer the Ollama model separately):
   ```bash
   ollama pull gemma4          # or whatever DEFAULT_MODEL is set to
   ```
   > Note: `apps/api/src/agent/registry.ts` defaults `DEFAULT_MODEL` to
   > `gemma4:26b`. Make sure the tag you pull matches, or override with the
   > `DEFAULT_MODEL` env var.

6. **Install the embedding model** (required for RAG / the knowledge base).
   RAG embeds text with the Ollama model **`nomic-embed-text`** (768-dim). On a
   networked machine: `ollama pull nomic-embed-text`. On an **air-gapped**
   machine, use the offline bundle `ollama-nomic-embed-text.zip` (~241 MB) —
   see [Offline embedding model](#offline-embedding-model-nomic-embed-text) below.

7. **Run the full stack:**
   ```bash
   npm run dev
   ```
   You should see `OFFLINE — using cached models` for both `stt` and `docproc`.

## Services and ports

| Service | URL | Notes |
|---|---|---|
| web (frontend) | http://localhost:5173 | Vite dev server |
| api (gateway) | http://localhost:8787 | Fastify; talks to Ollama |
| docproc | http://localhost:8801 | Docling |
| stt | http://localhost:8802 | faster-whisper |

## How device selection works

`scripts/run-stt.sh` auto-detects the compute device — **no per-machine config**:

- **NVIDIA GPU present** (`nvidia-smi` on PATH) → `cuda` + `float16`
- **No GPU** (typical Windows/laptop) → `cpu` + `int8`

Override anytime: `STT_DEVICE=cuda STT_COMPUTE_TYPE=float16 npm run dev`.

## Environment overrides

| Var | Default | Purpose |
|---|---|---|
| `HF_HOME` | `<repo>/models` | Where service models are read from |
| `STT_DEVICE` | auto (`cuda`/`cpu`) | Whisper compute device |
| `STT_COMPUTE_TYPE` | `float16` (cuda) / `int8` (cpu) | Whisper precision |
| `STT_MODEL` | `large-v3` | Whisper model size |
| `ALLOW_DOWNLOAD` | `0` | Set `1` to allow first-run model downloads (online only) |
| `DEFAULT_MODEL` | `gemma4:26b` | Ollama chat model |
| `VITE_API_URL` | `http://localhost:8787` | Frontend → API gateway URL |

## Offline embedding model (`nomic-embed-text`)

RAG (the knowledge base) requires the `nomic-embed-text` Ollama model. If the
machine can't reach the internet to `ollama pull` it, install it from the
bundle `ollama-nomic-embed-text.zip` (~241 MB, no symlinks — Windows-safe).

Ollama stores models under a `models` dir containing `manifests/` and `blobs/`:
- **Windows:** `%USERPROFILE%\.ollama\models`  (or wherever `OLLAMA_MODELS` points)
- **Linux/macOS:** `~/.ollama/models`

Install:

1. Transfer `ollama-nomic-embed-text.zip` to the machine out-of-band.
2. Extract it — it contains a folder `ollama-nomic-embed-text/` with `manifests/`
   and `blobs/` subfolders.
3. **Merge** those two folders into the Ollama models dir (do not overwrite the
   dir — merge, so existing models are preserved). On Windows, copy
   `ollama-nomic-embed-text\manifests` and `...\blobs` into
   `%USERPROFILE%\.ollama\models\` and choose "merge folders".
4. Verify (Ollama must be running):
   ```bash
   ollama list | grep nomic-embed-text
   ```

RAG then works fully offline. (Vectors are stored per `VECTOR_STORE`: `local`
JSON by default, or `pgvector` in production — see the env table above / the RAG
module in `apps/api/src/rag/`.)

To rebuild this bundle from a machine that already has the model pulled, copy
`~/.ollama/models/manifests/registry.ollama.ai/library/nomic-embed-text/latest`
plus the blob files it references (`blobs/sha256-*`) into a `manifests/`+`blobs/`
tree and zip it.

## Rebuilding the offline bundle (from an online machine)

If the models change, regenerate the symlink-free zip from a machine that has
them cached under `models/`:

```bash
# materialize symlinks into real files, drop redundant blobs, zip as models/
cp -RL models models-win
find models-win -type d -name blobs -exec rm -rf {} +
mkdir -p .winpkg && mv models-win .winpkg/models
( cd .winpkg && zip -r -1 ../models-offline-windows.zip models )
mv .winpkg/models ./models-win && rmdir .winpkg && rm -rf models-win
```
