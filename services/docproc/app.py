"""A-Chad document-processing service.

Self-hosted Docling: layout-aware PDF/DOCX/PPTX -> Markdown for LLM ingestion.
No cloud. Models are downloaded once into the container. Contract matches
apps/api/src/clients/docproc.ts:

    POST /extract  (multipart "file")  ->  { "markdown": ... }
"""

# Use the OS trust store (Windows/macOS/Linux) for TLS so corporate
# CA-signed certs from TLS-inspection proxies are trusted. Must run before
# any HTTPS request (e.g. Docling/HuggingFace model downloads).
import truststore

truststore.inject_into_ssl()

import os
import tempfile

from fastapi import FastAPI, File, UploadFile
from docling.document_converter import DocumentConverter

app = FastAPI(title="A-Chad DocProc (Docling)")

# Loaded once; first conversion downloads layout/OCR models.
converter = DocumentConverter()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    data = await file.read()
    suffix = os.path.splitext(file.filename or "")[1] or ".pdf"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()
        result = converter.convert(tmp.name)
        markdown = result.document.export_to_markdown()
    finally:
        os.unlink(tmp.name)
    return {"markdown": markdown}
