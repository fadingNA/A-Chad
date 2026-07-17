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
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

app = FastAPI(title="A-Chad DocProc (Docling)")

# --- OCR models (EasyOCR) are vendored in the repo so PDFs/scans work fully
# offline. Point Docling at that dir and disable runtime downloads. Override the
# location with EASYOCR_MODELS. Layout/table models come from HF_HOME (set by
# scripts/run-docproc.sh).
_OCR_DIR = os.environ.get(
    "EASYOCR_MODELS",
    os.path.join(os.path.dirname(__file__), "..", "..", "models", "easyocr"),
)
_pdf_opts = PdfPipelineOptions()
_pdf_opts.ocr_options = EasyOcrOptions(
    model_storage_directory=os.path.abspath(_OCR_DIR),
    download_enabled=False,
)

# Loaded once. PDFs use the offline-pinned OCR pipeline; other formats
# (DOCX/PPTX/XLSX/HTML/CSV/MD/…) use Docling defaults.
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=_pdf_opts)}
)


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
