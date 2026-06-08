import { randomUUID } from "node:crypto"
import { streamText, stepCountIs, tool, type ModelMessage } from "ai"
import { z } from "zod"
import {
  createAssistantStream,
  type AssistantStream,
  type AssistantStreamController,
} from "assistant-stream"
import { defaultModel, DEFAULT_MODEL } from "./registry"
import {
  resolveAttachmentsForModel,
  stripMarkers,
  attachmentsInText,
} from "../attachments/pipeline"
import {
  type AgentMessage,
  type AgentState,
  type ChatRequestBody,
  commandText,
  isAddUserMessage,
} from "../protocol"

/**
 * Spike tool — proves end-to-end multi-step tool calling through the bridge.
 * Step 3 replaces this with the real server-side toolset.
 */
const tools = {
  getServerTime: tool({
    description:
      "Get the current server time. Call this whenever the user asks what time it is.",
    inputSchema: z.object({}),
    execute: async () => ({ now: new Date().toISOString() }),
  }),
}

/**
 * assistant-ui data-stream `update-state` operations. The op union isn't
 * publicly exported, so we type it locally and cast at the single emit site.
 */
type StateOp =
  | { type: "set"; path: string[]; value: unknown }
  | { type: "append-text"; path: string[]; value: string }

function makeEmit(controller: AssistantStreamController) {
  return (operations: StateOp[]) =>
    controller.enqueue({
      path: [],
      type: "update-state",
      operations,
    } as never)
}

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.text.length > 0)
    .map((m) => ({ role: m.role, content: m.text }))
}

/** Raw user turns from the request, before attachment resolution. */
function rawUserTurns(body: ChatRequestBody): Array<{ id: string; raw: string }> {
  return body.commands
    .filter(isAddUserMessage)
    .map((c) => ({ id: randomUUID(), raw: commandText(c) }))
}

/**
 * Runs the agent for one request and returns an assistant-ui `AssistantStream`.
 *
 * The transport runtime is state-driven: it ignores streamed message content
 * and only reads `unstable_state` (rebuilt from the `update-state` ops we
 * emit). So we maintain `state.messages` here; the frontend `converter`
 * projects it into thread messages.
 */
export function runAgent(body: ChatRequestBody): AssistantStream {
  return createAssistantStream(async (controller) => {
    const emit = makeEmit(controller)

    const previous: AgentMessage[] = body.state?.messages ?? []
    const turns = rawUserTurns(body)

    // Display state: the user's typed text (markers stripped) plus attachment
    // metadata, which the UI renders as file chips under the message bubble.
    const displayUser: AgentMessage[] = turns.map((t) => ({
      id: t.id,
      role: "user",
      text: stripMarkers(t.raw),
      attachments: attachmentsInText(t.raw),
    }))
    const assistant: AgentMessage = {
      id: randomUUID(),
      role: "assistant",
      text: "",
      reasoning: "",
    }
    const messages: AgentMessage[] = [...previous, ...displayUser, assistant]
    const idx = String(messages.length - 1)
    const textPath = ["messages", idx, "text"]
    const reasoningPath = ["messages", idx, "reasoning"]

    // Pick a processing-stage label from the attachment kinds (shown in the UI
    // during the slow server-side resolution below).
    const kinds = new Set(
      displayUser.flatMap((m) => m.attachments?.map((a) => a.kind) ?? [])
    )
    const stage = kinds.has("audio")
      ? "Transcribing audio…"
      : kinds.has("document")
        ? "Reading document…"
        : kinds.has("image")
          ? "Analyzing image…"
          : kinds.has("text")
            ? "Reading file…"
            : ""

    // Commit prior + user message(s) + assistant placeholder + initial status.
    // This first state chunk also signals the runtime the commands were delivered.
    emit([
      { type: "set", path: ["messages"], value: messages },
      { type: "set", path: ["status"], value: stage || "Working…" },
    ])

    // Model prompt: expand attachment markers into resolved content —
    // text/PDF/audio inline, images as base64 parts for the vision model.
    // All processing is server-side (this is the slow step for audio/PDF).
    const priorModel: ModelMessage[] = toModelMessages(previous)
    const userModel: ModelMessage[] = await Promise.all(
      turns.map(async (t): Promise<ModelMessage> => {
        const { text, images } = await resolveAttachmentsForModel(t.raw)
        if (images.length === 0) return { role: "user", content: text }
        return {
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((img) => ({ type: "image" as const, image: img.dataUrl })),
          ],
        }
      })
    )

    // Attachments resolved; now waiting on the model (named for transparency).
    const modelLabel = DEFAULT_MODEL.replace(/:latest$/, "")
    emit([{ type: "set", path: ["status"], value: `Thinking · ${modelLabel}` }])

    const result = streamText({
      model: defaultModel,
      messages: [...priorModel, ...userModel],
      tools,
      stopWhen: stepCountIs(5),
      // Ask thinking models (gemma4, deepseek-r1, nemotron) to expose their
      // chain-of-thought as separate reasoning deltas.
      providerOptions: { ollama: { think: true } },
    })

    let cleared = false
    let reasoning = false
    const clearStatus = () => {
      if (cleared) return
      cleared = true
      emit([{ type: "set", path: ["status"], value: "" }])
    }

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta":
            // Stream the model's chain-of-thought into a reasoning field the UI
            // renders as a live, collapsible "thinking" panel.
            if (!reasoning) {
              reasoning = true
              emit([
                { type: "set", path: ["status"], value: "Reasoning…" },
                { type: "append-text", path: reasoningPath, value: part.text },
              ])
            } else {
              emit([{ type: "append-text", path: reasoningPath, value: part.text }])
            }
            break
          case "text-delta":
            clearStatus()
            emit([{ type: "append-text", path: textPath, value: part.text }])
            break
          case "tool-call":
            emit([
              { type: "set", path: ["status"], value: `Using ${part.toolName}…` },
              {
                type: "append-text",
                path: textPath,
                value: `\n\n_[calling ${part.toolName}…]_\n`,
              },
            ])
            break
          case "tool-result":
            emit([
              {
                type: "append-text",
                path: textPath,
                value: `_[${part.toolName} → ${JSON.stringify(part.output)}]_\n\n`,
              },
            ])
            break
          case "error":
            emit([
              { type: "append-text", path: textPath, value: `\n\n⚠️ ${String(part.error)}` },
            ])
            break
        }
      }
    } catch (err) {
      emit([{ type: "append-text", path: textPath, value: `\n\n⚠️ ${String(err)}` }])
    }

    clearStatus()
    controller.close()
  })
}

export type { AgentState }
