import { Readable } from "node:stream"
import Fastify from "fastify"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import { AssistantStream, DataStreamEncoder } from "assistant-stream"
import { runAgent } from "./agent/run"
import { registerAttachmentRoutes } from "./routes/attachments"
import { registerAgentRoute } from "./routes/agent"
import type { ChatRequestBody } from "./protocol"

const PORT = Number(process.env.PORT ?? 8787)
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173"

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100 MB

const app = Fastify({ logger: true, bodyLimit: MAX_FILE_BYTES })

await app.register(cors, { origin: ORIGIN, credentials: true })
await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES } })
await registerAttachmentRoutes(app)
await registerAgentRoute(app)

app.get("/health", async () => ({ ok: true }))

/**
 * assistant-transport command endpoint. Consumes `SendCommandsRequestBody`,
 * runs the agent, and streams an assistant-ui data-stream response.
 *
 * We hijack the reply to pipe the encoder's byte stream straight to the socket
 * (Fastify can't natively return a web ReadableStream).
 */
app.post("/chat", (req, reply) => {
  const body = req.body as ChatRequestBody
  const encoder = new DataStreamEncoder()
  const byteStream = AssistantStream.toByteStream(runAgent(body), encoder)

  reply.hijack()
  reply.raw.writeHead(200, {
    ...Object.fromEntries(encoder.headers),
    "access-control-allow-origin": ORIGIN,
    "cache-control": "no-cache, no-transform",
  })
  Readable.fromWeb(byteStream as Parameters<typeof Readable.fromWeb>[0]).pipe(
    reply.raw
  )
})

await app.listen({ port: PORT, host: "0.0.0.0" })
