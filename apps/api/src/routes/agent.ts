import type { FastifyInstance } from "fastify"
import { streamAgentEvents, type AgentTurn } from "../agent/core"

const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173"

/**
 * `POST /agent` — newline-delimited JSON (NDJSON) agent stream for the client
 * `ChatModelAdapter`. Body: `{ messages: AgentTurn[] }`. Streams `AgentEvent`s
 * (status / reasoning / text). Used by the local-runtime path so chat history
 * persists per-thread (IndexedDB), unlike the server-state transport route.
 */
export async function registerAgentRoute(app: FastifyInstance) {
  app.post("/agent", (req, reply) => {
    const body = req.body as { messages?: AgentTurn[]; model?: string }
    const turns = (body.messages ?? []).filter(
      (m): m is AgentTurn =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
    )
    const model = typeof body.model === "string" ? body.model : undefined

    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "access-control-allow-origin": ORIGIN,
      "cache-control": "no-cache, no-transform",
    })

    req.log.info({ turns: turns.length, model }, "[/agent] request")
    void (async () => {
      try {
        for await (const ev of streamAgentEvents(turns, req.log, model)) {
          res.write(JSON.stringify(ev) + "\n")
        }
      } catch (err) {
        req.log.error({ err: String(err) }, "[/agent] failed")
        res.write(JSON.stringify({ t: "error", v: String(err) }) + "\n")
      } finally {
        res.end()
      }
    })()
  })
}
