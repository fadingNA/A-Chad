/**
 * Embeddings via the local Ollama server — no OpenAI / cloud. Default model is
 * `nomic-embed-text` (768-dim), which is already pulled on the dev box. Both the
 * ingest path and query path go through here, so vectors are always comparable.
 */
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api"

/** Embedding model tag. Must match what pgvector's `vector(N)` column expects. */
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text"

/** Embedding dimensionality. `nomic-embed-text` = 768. Keep in sync with EMBED_MODEL. */
export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768)

interface EmbedResponse {
  embeddings?: number[][]
}

/** Embed a batch of texts. Returns one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await fetch(`${OLLAMA_URL}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    throw new Error(`embed failed: ${res.status} ${await res.text().catch(() => "")}`)
  }
  const data = (await res.json()) as EmbedResponse
  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new Error("embed: unexpected response shape from Ollama")
  }
  return data.embeddings
}

/** Embed a single text. */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text])
  if (!v) throw new Error("embed: empty result")
  return v
}
