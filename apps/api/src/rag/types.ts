/**
 * RAG vector-store seam.
 *
 * A single interface with swappable backends: a zero-dependency local JSON
 * store for testing, and pgvector for production. Callers (the knowledge base
 * facade, routes, agent) only know this interface — switching backends is one
 * env var (`VECTOR_STORE`). Mirrors the chat-store seam pattern on the web app.
 */

/** Metadata carried alongside each stored chunk. */
export interface ChunkMetadata {
  name: string
  mime?: string
  createdAt: number
  [key: string]: unknown
}

/** One embedded chunk of a source document. */
export interface VectorRecord {
  /** Stable id, `${documentId}:${chunkIndex}`. */
  id: string
  documentId: string
  chunkIndex: number
  text: string
  embedding: number[]
  metadata: ChunkMetadata
}

/** A search result: a stored chunk plus its similarity score (0..1, cosine). */
export interface SearchHit {
  id: string
  documentId: string
  chunkIndex: number
  text: string
  score: number
  metadata: ChunkMetadata
}

/** Summary of one ingested document. */
export interface DocumentInfo {
  documentId: string
  name: string
  chunks: number
  createdAt: number
}

/**
 * Pluggable vector store. Implementations: {@link LocalVectorStore} (JSON file)
 * and PgVectorStore (Postgres + pgvector).
 */
export interface VectorStore {
  /** Backend id, e.g. "local" | "pgvector" — for logging/health. */
  readonly kind: string
  /** Connect / create schema / load data. Call once before use. */
  init(): Promise<void>
  /** Insert or replace chunks by id. */
  upsert(records: VectorRecord[]): Promise<void>
  /** Top-k nearest chunks by cosine similarity to `embedding`. */
  search(embedding: number[], topK: number): Promise<SearchHit[]>
  /** Remove every chunk belonging to a document. */
  deleteDocument(documentId: string): Promise<void>
  /** List ingested documents (deduped by documentId). */
  listDocuments(): Promise<DocumentInfo[]>
  /** Total chunk count (used to skip retrieval when the KB is empty). */
  count(): Promise<number>
}
