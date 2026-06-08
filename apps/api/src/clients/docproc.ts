/**
 * Client for the document-processing service (`services/docproc`, Docling).
 * Converts PDF/DOCX/PPTX bytes → Markdown for LLM ingestion.
 *
 * Self-hosted only; no cloud. If the service is unreachable we surface a clear
 * message rather than failing the whole chat turn.
 */
const DOCPROC_URL = process.env.DOCPROC_URL ?? "http://localhost:8801"

export interface ExtractResult {
  markdown: string
  ok: boolean
  error?: string
}

export async function extractDocument(
  bytes: Buffer,
  name: string,
  mime: string
): Promise<ExtractResult> {
  try {
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name)
    const res = await fetch(`${DOCPROC_URL}/extract`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      return { markdown: "", ok: false, error: `docproc ${res.status}` }
    }
    const data = (await res.json()) as { markdown?: string }
    return { markdown: data.markdown ?? "", ok: true }
  } catch (err) {
    return {
      markdown: "",
      ok: false,
      error: `docproc unreachable at ${DOCPROC_URL}: ${String(err)}`,
    }
  }
}
