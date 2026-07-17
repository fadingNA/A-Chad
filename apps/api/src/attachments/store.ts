import { randomUUID } from "node:crypto"

/**
 * Ephemeral attachment store.
 *
 * Spike scope: in-memory, process-lifetime, with a simple TTL sweep. Production
 * (Step 4 hardening) swaps this for MinIO/object storage with per-user scoping
 * and delete-on-thread-delete — but the {@link AttachmentStore} surface stays
 * the same so callers don't change.
 */

export type AttachmentKind = "text" | "document" | "audio" | "image" | "other"

export interface StoredAttachment {
  id: string
  name: string
  mime: string
  kind: AttachmentKind
  bytes: Buffer
  createdAt: number
}

const TTL_MS = 1000 * 60 * 60 // 1h

/**
 * Classify by MIME / filename into a processing lane:
 *  - image / audio → sent to the vision / STT models
 *  - text → read inline (cheap; small plaintext-ish formats)
 *  - document → routed to Docling (Word/PowerPoint/Excel/PDF/HTML/…)
 *
 * Falls through to "document" so anything not obviously text/media still gets a
 * Docling extraction attempt — Docling supports DOCX, PPTX, XLSX, HTML, PDF,
 * CSV, MD and more, and fails gracefully if it can't parse a file.
 */
export function classify(mime: string, name: string): AttachmentKind {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  // HTML → Docling (extracts readable text, cleaner than raw markup).
  if (mime === "text/html" || ["html", "htm"].includes(ext)) return "document"
  // Small text-ish formats read inline — no docproc round-trip.
  const textExts = ["txt", "md", "markdown", "csv", "tsv", "json", "log", "yaml", "yml"]
  if (mime.startsWith("text/") || textExts.includes(ext)) return "text"
  // Everything else (PDF, Word, PowerPoint, Excel, ODF, RTF, …) → Docling.
  return "document"
}

const items = new Map<string, StoredAttachment>()

function sweep() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, a] of items) if (a.createdAt < cutoff) items.delete(id)
}

export const attachmentStore = {
  put(name: string, mime: string, bytes: Buffer): StoredAttachment {
    sweep()
    const a: StoredAttachment = {
      id: randomUUID(),
      name,
      mime,
      kind: classify(mime, name),
      bytes,
      createdAt: Date.now(),
    }
    items.set(a.id, a)
    return a
  },
  get(id: string): StoredAttachment | undefined {
    return items.get(id)
  },
  delete(id: string): void {
    items.delete(id)
  },
}
