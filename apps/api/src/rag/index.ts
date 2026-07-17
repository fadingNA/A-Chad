import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { extractDocument } from "../clients/docproc"
import { chunkText } from "./chunk"
import { embed, embedOne } from "./embeddings"
import { LocalVectorStore } from "./stores/local-store"
import type { DocumentInfo, SearchHit, VectorStore } from "./types"

/**
 * Knowledge-base facade over the {@link VectorStore} seam. Owns the backend
 * choice (local JSON vs pgvector), and the ingest (extract → chunk → embed →
 * store) and retrieve (embed query → nearest chunks → context block) pipelines.
 *
 * Switch backends with one env var:
 *   VECTOR_STORE=local     (default) → JSON file at RAG_DATA_FILE
 *   VECTOR_STORE=pgvector  → Postgres, needs DATABASE_URL
 */

const TOP_K = Number(process.env.RAG_TOP_K ?? 5)
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.35)

let storePromise: Promise<VectorStore> | null = null

/** Lazily construct + init the configured store (once per process). */
export function getVectorStore(): Promise<VectorStore> {
  if (!storePromise) storePromise = createVectorStore()
  return storePromise
}

async function createVectorStore(): Promise<VectorStore> {
  const kind = (process.env.VECTOR_STORE ?? "local").toLowerCase()
  if (kind === "pgvector" || kind === "postgres" || kind === "pg") {
    const conn = process.env.DATABASE_URL ?? process.env.PG_URL
    if (!conn) {
      throw new Error("VECTOR_STORE=pgvector requires DATABASE_URL (postgres://…)")
    }
    const { PgVectorStore } = await import("./stores/pgvector-store")
    const store = new PgVectorStore(conn)
    await store.init()
    return store
  }
  const file =
    process.env.RAG_DATA_FILE ?? resolve(process.cwd(), "data/rag/vectors.json")
  const store = new LocalVectorStore(file)
  await store.init()
  return store
}

export interface IngestInput {
  name: string
  mime: string
  bytes: Buffer
  /** Re-ingest an existing doc by passing its id (its old chunks are replaced). */
  documentId?: string
}

export interface IngestResult {
  documentId: string
  name: string
  chunks: number
}

/** Extract text from a file: plaintext inline, everything else via Docling. */
async function extractText(input: IngestInput): Promise<string> {
  // HTML goes to Docling (readable text, not raw markup) — matches the
  // attachment classifier. Small plaintext formats are read inline.
  const isText =
    (input.mime.startsWith("text/") && input.mime !== "text/html") ||
    /\.(txt|md|markdown|csv|tsv|json|log|ya?ml)$/i.test(input.name)
  if (isText) return input.bytes.toString("utf8")

  const r = await extractDocument(input.bytes, input.name, input.mime)
  if (!r.ok) throw new Error(r.error ?? "document extraction failed")
  return r.markdown
}

/** Ingest a document into the knowledge base. Idempotent per documentId. */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const store = await getVectorStore()
  const text = await extractText(input)
  const chunks = chunkText(text)
  if (chunks.length === 0) throw new Error("no extractable text in document")

  const embeddings = await embed(chunks)
  const documentId = input.documentId ?? randomUUID()
  const createdAt = Date.now()
  const records = chunks.map((chunk, i) => ({
    id: `${documentId}:${i}`,
    documentId,
    chunkIndex: i,
    text: chunk,
    embedding: embeddings[i]!,
    metadata: { name: input.name, mime: input.mime, createdAt },
  }))

  await store.deleteDocument(documentId) // replace on re-ingest
  await store.upsert(records)
  return { documentId, name: input.name, chunks: records.length }
}

export interface RetrieveResult {
  hits: SearchHit[]
  /** Ready-to-inject context block (empty when nothing relevant was found). */
  context: string
}

/** Retrieve the most relevant chunks for a query and format them as context. */
export async function retrieve(
  query: string,
  topK = TOP_K,
  minScore = MIN_SCORE
): Promise<RetrieveResult> {
  const store = await getVectorStore()
  if ((await store.count()) === 0) return { hits: [], context: "" }
  const emb = await embedOne(query)
  const hits = (await store.search(emb, topK)).filter((h) => h.score >= minScore)
  return { hits, context: formatContext(hits) }
}

/** Number of chunks currently in the KB (0 → skip retrieval entirely). */
export async function knowledgeCount(): Promise<number> {
  return (await getVectorStore()).count()
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  return (await getVectorStore()).listDocuments()
}

export async function deleteDocument(documentId: string): Promise<void> {
  return (await getVectorStore()).deleteDocument(documentId)
}

/** Render hits into a numbered, source-attributed context block. */
function formatContext(hits: SearchHit[]): string {
  if (hits.length === 0) return ""
  return hits
    .map((h, i) => `[${i + 1}] (source: ${h.metadata.name})\n${h.text}`)
    .join("\n\n")
}
