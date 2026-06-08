import type { ThreadMessage } from "@assistant-ui/react"
import { fromThreadMessageLike } from "@assistant-ui/core/internal"

/**
 * Client-side mirror of the gateway's server-authoritative agent state
 * (apps/api/src/protocol.ts) and the `converter` that projects it into
 * assistant-ui thread messages.
 *
 * The transport runtime feeds the converter's output straight into an external
 * store WITHOUT a convertMessage step, so it must return fully-formed
 * `ThreadMessage`s — we build them with `fromThreadMessageLike`.
 */

export type AgentRole = "user" | "assistant"

export interface AgentAttachment {
  id: string
  name: string
  kind: string
  mime: string
}

export interface AgentMessage {
  id: string
  role: AgentRole
  text: string
  reasoning?: string
  attachments?: AgentAttachment[]
}

export interface AgentState {
  messages: AgentMessage[]
  status?: string
}

export const agentInitialState: AgentState = { messages: [] }

interface ConnectionMeta {
  pendingCommands: readonly unknown[]
  isSending: boolean
}

/** A CompleteAttachment-shaped object for ThreadMessageLike.attachments. */
type LikeAttachment = {
  id: string
  type: "image" | "document" | "file"
  name: string
  contentType: string
  content: never[]
  status: { type: "complete" }
}

type LikePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }

/** Loose ThreadMessageLike shape we hand to fromThreadMessageLike. */
type Like = {
  id: string
  role: AgentRole
  content: LikePart[]
  status?: { type: "running" } | { type: "complete"; reason: "stop" }
  attachments?: LikeAttachment[]
  metadata?: { custom: Record<string, unknown> }
}

function toLikeAttachment(a: AgentAttachment): LikeAttachment {
  const type = a.kind === "image" ? "image" : a.kind === "document" ? "document" : "file"
  return {
    id: a.id,
    type,
    name: a.name,
    contentType: a.mime,
    content: [],
    status: { type: "complete" },
  }
}

function like(
  id: string,
  role: AgentRole,
  text: string,
  opts?: { reasoning?: string; attachments?: AgentAttachment[] }
): Like {
  const content: LikePart[] = []
  // Reasoning first so the "thinking" panel renders above the answer.
  if (opts?.reasoning) content.push({ type: "reasoning", text: opts.reasoning })
  if (text) content.push({ type: "text", text })
  return {
    id,
    role,
    content,
    ...(opts?.attachments?.length
      ? { attachments: opts.attachments.map(toLikeAttachment) }
      : {}),
  }
}

/** Pull the user text out of a pending `add-message` command, if it is one. */
function pendingUserText(cmd: unknown): string | null {
  if (typeof cmd !== "object" || cmd === null) return null
  const c = cmd as {
    type?: string
    message?: { role?: string; parts?: ReadonlyArray<{ type?: string; text?: string }> }
  }
  if (c.type !== "add-message" || c.message?.role !== "user") return null
  return (c.message.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
}

/**
 * Projects the gateway state into thread messages. While a send is in flight,
 * the user's message is shown optimistically from the pending command queue
 * and the trailing assistant message is marked running (streaming cursor).
 */
export function agentConverter(state: AgentState, meta: ConnectionMeta) {
  const likes: Like[] = state.messages.map((m) =>
    like(m.id, m.role, m.text, {
      reasoning: m.reasoning,
      attachments: m.attachments,
    })
  )

  for (const cmd of meta.pendingCommands) {
    const text = pendingUserText(cmd)
    if (text === null) continue
    const shown = text.replace(/\[\[attachment:[0-9a-fA-F-]+\]\]/g, "📎").trim()
    likes.push(like(`pending-${likes.length}`, "user", shown))
  }

  if (meta.isSending) {
    const status = state.status ?? ""
    const last = likes[likes.length - 1]
    if (last && last.role === "assistant") {
      last.status = { type: "running" }
      last.metadata = { custom: { status } }
    } else {
      // Initial window (upload / before the gateway commits state): show a
      // running assistant bubble so the indicator appears immediately.
      likes.push({
        id: `running-${likes.length}`,
        role: "assistant",
        content: [],
        status: { type: "running" },
        metadata: { custom: { status } },
      })
    }
  }

  const messages = likes.map((l, i) =>
    fromThreadMessageLike(l, l.id || `m-${i}`, { type: "complete", reason: "stop" })
  )

  return {
    messages: messages as ThreadMessage[],
    isRunning: meta.isSending,
  }
}
