/**
 * Shared agent-transport protocol types (spike subset).
 *
 * Mirrors the parts of assistant-ui's `SendCommandsRequestBody` we consume and
 * defines the server-owned agent state that the frontend `converter` renders.
 * In Step 1 this graduates into `packages/agent-protocol` shared by web + api.
 */

export type AgentRole = "user" | "assistant"

/** A file attached to a user message (metadata for display under the bubble). */
export interface AgentAttachment {
  id: string
  name: string
  kind: string
  mime: string
}

/** One message in the server-authoritative conversation state. */
export interface AgentMessage {
  id: string
  role: AgentRole
  text: string
  /** Streamed chain-of-thought for thinking models (shown in a collapsible panel). */
  reasoning?: string
  attachments?: AgentAttachment[]
}

/** The `state` object the gateway owns and streams back via update-state ops. */
export interface AgentState {
  messages: AgentMessage[]
  /** Current processing stage, shown in the UI while a turn is running. */
  status?: string
}

export interface AddMessageCommand {
  type: "add-message"
  message: {
    role: "user" | "assistant"
    parts: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    >
  }
  parentId: string | null
  sourceId: string | null
}

export type TransportCommand =
  | AddMessageCommand
  | { type: string; [key: string]: unknown }

/** Request body POSTed by `useAssistantTransportRuntime` to `/chat`. */
export interface ChatRequestBody {
  commands: TransportCommand[]
  state: AgentState | null
  system?: string
  [key: string]: unknown
}

export function isAddUserMessage(c: TransportCommand): c is AddMessageCommand {
  return c.type === "add-message" && (c as AddMessageCommand).message?.role === "user"
}

/** Flatten a command's text parts (images are handled in Step 4). */
export function commandText(c: AddMessageCommand): string {
  return c.message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}
