import { test } from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { collect, hasEmbedModel, ollamaUp, pickChatModel } from "./helpers"

/**
 * End-to-end RAG test against the real code path and a live local Ollama:
 *   ingest a document → retrieve it → the agent answers using that context.
 *
 * Auto-skips when Ollama / the embedding model / a chat model aren't available,
 * so it's safe to run anywhere. The KB is isolated to a temp JSON file — set
 * BEFORE importing the rag module (env is read on first store use).
 */
process.env.VECTOR_STORE = "local"
process.env.RAG_ENABLED = "true"
const RAG_FILE = join(tmpdir(), `rag-e2e-${randomUUID()}.json`)
process.env.RAG_DATA_FILE = RAG_FILE

// A distinctive fact no base model could know — so a correct answer *proves*
// the retrieved context was used.
const SECRET = "The A-Chad team mascot is a purple axolotl named Zorbex."

test("RAG e2e: ingest → retrieve → agent uses context", { timeout: 300_000 }, async (t) => {
  if (!(await ollamaUp())) return t.skip("Ollama not reachable")
  if (!(await hasEmbedModel())) return t.skip("embedding model not installed")

  const { ingestDocument, retrieve } = await import("../src/rag/index")

  // 1) Ingest
  const ing = await ingestDocument({
    name: "mascot.txt",
    mime: "text/plain",
    bytes: Buffer.from(SECRET),
  })
  assert.ok(ing.chunks >= 1, "ingest produced no chunks")

  // 2) Retrieve — semantic query with no keyword overlap with "mascot/Zorbex"
  const { hits } = await retrieve("what animal represents our team?")
  assert.ok(hits.length >= 1, "expected at least one retrieval hit")
  assert.match(hits[0]!.text, /Zorbex/, "top hit is not the ingested fact")

  // 3) Agent uses the context
  const model = await pickChatModel()
  if (!model) return t.skip("no chat model installed")

  const { streamAgentEvents } = await import("../src/agent/core")
  const gen = streamAgentEvents(
    [{ role: "user", text: "What is our team mascot's name? Answer in one short sentence." }],
    undefined,
    model
  )
  const { text, statuses, errors } = await collect(gen)

  assert.equal(errors.length, 0, `agent emitted errors: ${errors.join("; ")}`)
  assert.ok(
    statuses.some((s) => /knowledge base/i.test(s)),
    `expected a 'Searching knowledge base…' status; got: ${statuses.join(" | ")}`
  )
  assert.match(
    text,
    /Zorbex/i,
    `agent answer did not use the retrieved context: ${text.slice(0, 300)}`
  )

  await rm(RAG_FILE, { force: true })
})
