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

/** Classify by MIME / filename into a processing lane. */
export function classify(mime: string, name: string): AttachmentKind {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (
    mime === "application/pdf" ||
    mime.includes("officedocument") ||
    mime === "application/msword" ||
    ["pdf", "docx", "pptx", "doc"].includes(ext)
  )
    return "document"
  if (
    mime.startsWith("text/") ||
    ["txt", "md", "markdown", "csv", "json", "log", "yaml", "yml"].includes(ext)
  )
    return "text"
  return "other"
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
