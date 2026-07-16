import type { FastifyInstance } from "fastify"
import {
  deleteDocument,
  getVectorStore,
  ingestDocument,
  listDocuments,
  retrieve,
} from "../rag"

/**
 * Knowledge-base management routes.
 *
 *   POST   /knowledge          (multipart "file")  → ingest a document
 *   GET    /knowledge                              → list ingested documents
 *   DELETE /knowledge/:id                          → remove a document
 *   POST   /knowledge/search   { query, topK? }    → debug retrieval
 *
 * Ingestion reuses the same Docling extraction as chat attachments, then
 * chunks + embeds (local Ollama) + stores in the configured vector backend.
 */
export async function registerKnowledgeRoutes(app: FastifyInstance) {
  app.post("/knowledge", async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: "no file" })
    const bytes = await file.toBuffer()
    try {
      const result = await ingestDocument({
        name: file.filename,
        mime: file.mimetype,
        bytes,
      })
      req.log.info(result, "[/knowledge] ingested")
      return result
    } catch (err) {
      req.log.error({ err: String(err) }, "[/knowledge] ingest failed")
      return reply.code(500).send({ error: String(err) })
    }
  })

  app.get("/knowledge", async () => {
    const store = await getVectorStore()
    return { backend: store.kind, documents: await listDocuments() }
  })

  app.delete<{ Params: { id: string } }>("/knowledge/:id", async (req) => {
    await deleteDocument(req.params.id)
    return { ok: true, documentId: req.params.id }
  })

  app.post<{ Body: { query?: string; topK?: number } }>(
    "/knowledge/search",
    async (req, reply) => {
      const query = req.body?.query?.trim()
      if (!query) return reply.code(400).send({ error: "query required" })
      const { hits } = await retrieve(query, req.body?.topK)
      return {
        hits: hits.map((h) => ({
          documentId: h.documentId,
          chunkIndex: h.chunkIndex,
          score: Number(h.score.toFixed(4)),
          name: h.metadata.name,
          preview: h.text.slice(0, 200),
        })),
      }
    }
  )
}
