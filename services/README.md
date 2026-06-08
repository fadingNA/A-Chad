# A-Chad self-hosted services

Heavy multimodal processing, run as containers. **No OpenAI / no cloud** — all
model weights download into the containers and inference is local.

| Service | Tech | Port | Endpoint | Used by |
|---------|------|------|----------|---------|
| `docproc` | [Docling](https://github.com/docling-project/docling) | 8801 | `POST /extract` (multipart `file`) → `{ markdown }` | PDF / DOCX / PPTX ingestion |
| `stt` | [SeamlessM4T v2](https://huggingface.co/facebook/seamless-m4t-v2-large) (no OpenAI) + `mms-lid` | 8802 | `POST /transcribe` (multipart `file`, optional `language`) → `{ text, language }` | audio ingestion (fr/es/pt/zh + ~95 langs, with punctuation) |

## Run

The root `docker-compose.yml` runs the **whole stack** (web + gateway + these
services) in one command:

```bash
# from repo root — also start host Ollama with: OLLAMA_HOST=0.0.0.0 ollama serve
docker compose up --build
```

Just these two services:

```bash
docker compose up --build docproc stt
```

First start is slow: `docproc` downloads Docling layout/OCR models (baked at
build time) and `stt` downloads the Meta MMS weights on first request (cached in
the `hf-cache` volume thereafter).

## GPU (recommended for MMS / big PDFs)

- **stt**: set `STT_DEVICE=cuda` and use a CUDA torch wheel / base image.
  Default is CPU.
- **docproc**: Docling auto-uses CUDA if a GPU is visible to the container.

## How the gateway finds them

`apps/api` reads `DOCPROC_URL` (default `http://localhost:8801`) and `STT_URL`
(default `http://localhost:8802`) — which match the compose port mappings. If a
service is down, the gateway degrades gracefully: the chat still answers, with a
note that extraction/transcription was unavailable.

## Smoke test (without the gateway)

```bash
curl -F "file=@/path/to/doc.pdf"  http://localhost:8801/extract   | jq .markdown
curl -F "file=@/path/to/clip.m4a" http://localhost:8802/transcribe | jq .text
```
