import type { FastifyInstance } from "fastify"
import { attachmentStore } from "../attachments/store"

/**
 * `POST /attachments` (multipart) — store an uploaded file, return a reference
 * the client embeds in its message as `[[attachment:<id>]]`. The gateway
 * resolves and processes it at agent time (text inline, PDF→Docling,
 * audio→faster-whisper). Heavy processing stays server-side; the browser stays
 * thin.
 */
export async function registerAttachmentRoutes(app: FastifyInstance) {
  app.post("/attachments", async (req, reply) => {
    const file = await req.file()
    if (!file) {
      return reply.code(400).send({ error: "no file" })
    }
    const bytes = await file.toBuffer()
    const stored = attachmentStore.put(
      file.filename,
      file.mimetype,
      bytes
    )
    return {
      attachmentId: stored.id,
      name: stored.name,
      mime: stored.mime,
      kind: stored.kind,
      size: bytes.length,
    }
  })
}
