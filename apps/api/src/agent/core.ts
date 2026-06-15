import { streamText, stepCountIs, tool, type ModelMessage } from "ai"
import { z } from "zod"
import { modelFor } from "./registry"
import { resolveAttachmentsForModel, attachmentsInText } from "../attachments/pipeline"
import { condenseTranscript } from "./summarize"

/** One conversation turn as sent by the client ChatModelAdapter. */
export interface AgentTurn {
  role: "user" | "assistant"
  text: string
}

/** Streamed agent events consumed by the client adapter. */
export type AgentEvent =
  | { t: "status"; v: string }
  | { t: "reasoning"; v: string }
  | { t: "text"; v: string }
  | { t: "error"; v: string }

const tools = {
  getServerTime: tool({
    description:
      "Get the current server time. Call this whenever the user asks what time it is.",
    inputSchema: z.object({}),
    execute: async () => ({ now: new Date().toISOString() }),
  }),
}

/** Tiny async channel to bridge a progress callback into a generator. */
function createChannel<T>() {
  const items: T[] = []
  let wake: (() => void) | null = null
  let closed = false
  return {
    push(x: T) {
      items.push(x)
      wake?.()
      wake = null
    },
    close() {
      closed = true
      wake?.()
      wake = null
    },
    async *drain(): AsyncGenerator<T> {
      while (true) {
        while (items.length) yield items.shift()!
        if (closed) return
        await new Promise<void>((r) => (wake = r))
      }
    },
  }
}

function stageFor(turns: AgentTurn[]): string {
  const lastUser = [...turns].reverse().find((t) => t.role === "user")
  const kinds = new Set(
    (lastUser ? attachmentsInText(lastUser.text) : []).map((a) => a.kind)
  )
  if (kinds.has("audio")) return "Transcribing audio…"
  if (kinds.has("document")) return "Reading document…"
  if (kinds.has("image")) return "Analyzing image…"
  if (kinds.has("text")) return "Reading file…"
  return ""
}

/** Minimal logger interface (Fastify's pino `req.log` satisfies it). */
export interface Logger {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}
const consoleLogger: Logger = {
  info: (o, m) => console.log("[agent]", m ?? "", o),
  warn: (o, m) => console.warn("[agent]", m ?? "", o),
  error: (o, m) => console.error("[agent]", m ?? "", o),
}

function promptChars(messages: ModelMessage[]): number {
  let n = 0
  for (const m of messages) {
    if (typeof m.content === "string") n += m.content.length
    else
      for (const p of m.content)
        if (p.type === "text") n += p.text.length
  }
  return n
}

/**
 * Runs the agent for a conversation and yields events. Shared by the HTTP route
 * (/agent). Resolves attachment markers server-side (text/PDF/audio inline,
 * images as vision parts), routes to the model, and streams reasoning + text.
 *
 * Adapts to prompt size (long transcripts from 30-min audio etc.): raises
 * Ollama's context window so the transcript isn't truncated, and disables
 * "thinking" for large inputs (reasoning over a huge transcript on CPU stalls).
 * Logs timing/sizes via `log` so slow turns are diagnosable.
 */
export async function* streamAgentEvents(
  turns: AgentTurn[],
  log: Logger = consoleLogger,
  modelName?: string
): AsyncGenerator<AgentEvent> {
  const t0 = Date.now()
  const { id: modelId, model } = modelFor(modelName)
  log.info({ turns: turns.length, model: modelId }, "start")

  const stage = stageFor(turns)
  if (stage) yield { t: "status", v: stage }

  const tResolve = Date.now()
  const modelMessages: ModelMessage[] = []
  for (const turn of turns) {
    if (turn.role === "assistant") {
      if (turn.text) modelMessages.push({ role: "assistant", content: turn.text })
      continue
    }
    // Resolve attachments (audio streams its transcript chunk-by-chunk), then
    // map-reduce summarize if the transcript is very long (e.g. 30-min audio)
    // so the final prompt stays small/fast. All progress streams to the UI.
    const channel = createChannel<AgentEvent>()
    const work = (async () => {
      const { userText, attachmentText, images } = await resolveAttachmentsForModel(
        turn.text,
        (status) => channel.push({ t: "status", v: status })
      )
      let context = attachmentText
      if (attachmentText.length > 12_000) {
        const digest = await condenseTranscript(attachmentText, (status) =>
          channel.push({ t: "status", v: status })
        )
        context =
          "### Condensed summary of the attached audio/document (long source, auto-summarized):\n\n" +
          digest
      }
      const finalText = [userText, context].filter(Boolean).join("\n\n")
      return { finalText, images }
    })().finally(() => channel.close())

    for await (const ev of channel.drain()) yield ev
    const { finalText, images } = await work

    if (images.length === 0) {
      modelMessages.push({ role: "user", content: finalText })
    } else {
      modelMessages.push({
        role: "user",
        content: [
          { type: "text", text: finalText },
          ...images.map((img) => ({ type: "image" as const, image: img.dataUrl })),
        ],
      })
    }
  }

  // Size-adaptive model settings.
  const chars = promptChars(modelMessages)
  const approxTokens = Math.round(chars / 4)
  const isLong = approxTokens > 3000
  const think = !isLong // reasoning over a huge transcript on CPU stalls
  const numCtx = Math.min(32768, Math.max(8192, approxTokens + 2048))
  log.info(
    { promptChars: chars, approxTokens, think, numCtx, resolveMs: Date.now() - tResolve },
    "prompt ready"
  )

  const modelLabel = modelId.replace(/:latest$/, "")
  yield {
    t: "status",
    v: isLong ? `Summarizing ~${approxTokens} tokens · ${modelLabel}` : `Thinking · ${modelLabel}`,
  }

  const result = streamText({
    model,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    providerOptions: {
      ollama: { think, options: { num_ctx: numCtx, num_predict: 2048 } },
    },
  })

  let reasoned = false
  let ttft = 0
  let reasoningChars = 0
  let textChars = 0
  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta":
          if (!ttft) {
            ttft = Date.now() - t0
            log.info({ ttftMs: ttft }, "first token (reasoning)")
          }
          if (!reasoned) {
            reasoned = true
            yield { t: "status", v: "Reasoning…" }
          }
          reasoningChars += part.text.length
          yield { t: "reasoning", v: part.text }
          break
        case "text-delta":
          if (!ttft) {
            ttft = Date.now() - t0
            log.info({ ttftMs: ttft }, "first token (text)")
          }
          textChars += part.text.length
          yield { t: "text", v: part.text }
          break
        case "tool-call":
          yield { t: "status", v: `Using ${part.toolName}…` }
          break
        case "error":
          log.error({ error: String(part.error) }, "stream error")
          yield { t: "error", v: String(part.error) }
          break
      }
    }
    log.info(
      { totalMs: Date.now() - t0, ttftMs: ttft, reasoningChars, textChars },
      "done"
    )
  } catch (err) {
    log.error({ error: String(err), totalMs: Date.now() - t0 }, "failed")
    yield { t: "error", v: String(err) }
  }
}
