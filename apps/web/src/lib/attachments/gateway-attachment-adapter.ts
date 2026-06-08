import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react"

/**
 * Thin client attachment adapter: uploads the file to the gateway and returns
 * a `[[attachment:<id>]]` reference. All heavy processing (text inline,
 * PDF→Docling, audio→faster-whisper) happens server-side — the browser never
 * parses files. The gateway resolves the marker at agent time.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

const ACCEPT = [
  "text/*",
  "application/pdf",
  ".md",
  ".markdown",
  ".csv",
  ".docx",
  ".pptx",
  "audio/*",
  "image/*",
].join(",")

function kindOf(mime: string): PendingAttachment["type"] {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf" || mime.includes("officedocument")) return "document"
  return "file"
}

export function createGatewayAttachmentAdapter(): AttachmentAdapter {
  return {
    accept: ACCEPT,

    async add({ file }): Promise<PendingAttachment> {
      return {
        id: crypto.randomUUID(),
        type: kindOf(file.type),
        name: file.name,
        contentType: file.type,
        file,
        status: { type: "requires-action", reason: "composer-send" },
      }
    },

    async send(attachment): Promise<CompleteAttachment> {
      const form = new FormData()
      form.append("file", attachment.file, attachment.name)

      const res = await fetch(`${API_URL}/attachments`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        throw new Error(`Attachment upload failed (${res.status})`)
      }
      const { attachmentId } = (await res.json()) as { attachmentId: string }

      return {
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        contentType: attachment.contentType,
        // This marker rides along in the user message; the gateway expands it
        // into the resolved file/audio content for the model.
        content: [{ type: "text", text: `[[attachment:${attachmentId}]]` }],
        status: { type: "complete" },
      }
    },

    async remove() {
      // Files are ephemeral on the gateway (TTL); nothing to clean up here yet.
    },
  }
}
