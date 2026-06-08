# A-Chad DocProc (Docling). CPU image; Docling can use GPU if available.
FROM python:3.12-slim

WORKDIR /app

# OpenCV / image libs Docling's layout + OCR models depend on.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Docling models at build time so the first request is fast.
RUN python -c "from docling.document_converter import DocumentConverter; DocumentConverter()" || true

COPY app.py .

EXPOSE 8801
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8801"]
