import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ThreadMessage,
} from "@assistant-ui/react"

/**
 * Consumes the gateway's NDJSON /agent stream as a ChatModelAdapter, so chat
 * runs on the local runtime (with the IndexedDB chat-store) — giving real
 * multi-conversation persistence and per-thread history reload, while the
 * gateway still does attachment/audio/vision/model work.
 *
 * Reasoning streams as a `reasoning` content part; the live processing stage
 * rides in `metadata.custom.status` (both rendered by the Thread UI).
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

type Turn = { role: "user" | "assistant"; text: string }

/** Flatten a thread message (typed text + attachment markers) into plain text. */
function toTurns(messages: readonly ThreadMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const parts = [
      ...m.content,
      ...(m.role === "user" ? m.attachments?.flatMap((a) => a.content) ?? [] : []),
    ]
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim()
    turns.push({ role: m.role, text })
  }
  return turns
}

export function createGatewayModelAdapter(): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
      const res = await fetch(`${API_URL}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: toTurns(messages) }),
        signal: abortSignal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`Gateway error ${res.status}: ${res.statusText}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let reasoning = ""
      let text = ""
      let status = ""

      const result = () => ({
        content: [
          ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
          ...(text ? [{ type: "text" as const, text }] : []),
        ],
        metadata: { custom: { status } },
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          let ev: { t: string; v: string }
          try {
            ev = JSON.parse(line)
          } catch {
            continue
          }
          if (ev.t === "status") status = ev.v
          else if (ev.t === "reasoning") reasoning += ev.v
          else if (ev.t === "text") {
            status = "" // answer started — drop the processing stage
            text += ev.v
          } else if (ev.t === "error") text += `\n\n⚠️ ${ev.v}`
          yield result()
        }
      }

      status = ""
      yield result()
    },
  }
}
