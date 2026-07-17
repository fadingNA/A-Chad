/** Shared test helpers: Ollama availability probes and event collection. */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api"

async function tags(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    return (data.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

/** True if the local Ollama server is reachable. */
export async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/tags`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

/** True if the configured embedding model is installed. */
export async function hasEmbedModel(): Promise<boolean> {
  const want = process.env.EMBED_MODEL ?? "nomic-embed-text"
  const names = await tags()
  return names.some((n) => n === want || n.startsWith(`${want}:`))
}

/**
 * Pick a chat model for the agent test: TEST_CHAT_MODEL if set, else an
 * installed non-embedding model (prefer gemma4 as a balanced default).
 */
export async function pickChatModel(): Promise<string | null> {
  if (process.env.TEST_CHAT_MODEL) return process.env.TEST_CHAT_MODEL
  const chat = (await tags()).filter((n) => !n.includes("embed"))
  return chat.find((n) => n.startsWith("gemma4")) ?? chat[0] ?? null
}

/** Drain an agent event generator into grouped fields. */
export async function collect(
  gen: AsyncGenerator<{ t: string; v: string }>
): Promise<{
  text: string
  reasoning: string
  statuses: string[]
  errors: string[]
}> {
  const events: Array<{ t: string; v: string }> = []
  for await (const ev of gen) events.push(ev)
  const byType = (t: string) => events.filter((e) => e.t === t).map((e) => e.v)
  return {
    text: byType("text").join(""),
    reasoning: byType("reasoning").join(""),
    statuses: byType("status"),
    errors: byType("error"),
  }
}
