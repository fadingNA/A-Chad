import type { Pool } from "pg"
import { EMBED_DIM } from "../embeddings"
import type {
  DocumentInfo,
  SearchHit,
  VectorRecord,
  VectorStore,
} from "../types"

/**
 * Production vector store: Postgres + pgvector. Selected with
 * `VECTOR_STORE=pgvector` and `DATABASE_URL=postgres://…`.
 *
 * `pg` is imported dynamically by the factory so local/testing runs (the
 * default `local` backend) never need Postgres running or the driver connected.
 * Cosine distance via the `<=>` operator; score = 1 − distance.
 */
export class PgVectorStore implements VectorStore {
  readonly kind = "pgvector"
  private pool!: Pool

  constructor(private readonly connectionString: string) {}

  async init(): Promise<void> {
    // Dynamic import keeps `pg` off the hot path for the local backend.
    const pg = (await import("pg")).default
    this.pool = new pg.Pool({ connectionString: this.connectionString })

    await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector")
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rag_chunks (
        id          text PRIMARY KEY,
        document_id text NOT NULL,
        chunk_index int  NOT NULL,
        text        text NOT NULL,
        metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
        embedding   vector(${EMBED_DIM}) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `)
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS rag_chunks_doc_idx ON rag_chunks (document_id)"
    )
    // Approximate-NN index for scale. Harmless if it already exists; ignore if
    // the pgvector build is too old to support ivfflat.
    await this.pool
      .query(
        "CREATE INDEX IF NOT EXISTS rag_chunks_embed_idx ON rag_chunks " +
          "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
      )
      .catch(() => {})
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      for (const r of records) {
        await client.query(
          `INSERT INTO rag_chunks (id, document_id, chunk_index, text, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)
           ON CONFLICT (id) DO UPDATE
             SET text = EXCLUDED.text,
                 metadata = EXCLUDED.metadata,
                 embedding = EXCLUDED.embedding`,
          [
            r.id,
            r.documentId,
            r.chunkIndex,
            r.text,
            JSON.stringify(r.metadata),
            toVector(r.embedding),
          ]
        )
      }
      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  }

  async search(embedding: number[], topK: number): Promise<SearchHit[]> {
    const res = await this.pool.query(
      `SELECT id, document_id, chunk_index, text, metadata,
              1 - (embedding <=> $1::vector) AS score
         FROM rag_chunks
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
      [toVector(embedding), topK]
    )
    return res.rows.map((row) => ({
      id: row.id as string,
      documentId: row.document_id as string,
      chunkIndex: row.chunk_index as number,
      text: row.text as string,
      score: Number(row.score),
      metadata: row.metadata as SearchHit["metadata"],
    }))
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.pool.query("DELETE FROM rag_chunks WHERE document_id = $1", [documentId])
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    const res = await this.pool.query(
      `SELECT document_id,
              max(metadata->>'name') AS name,
              count(*)::int AS chunks,
              min(created_at) AS created_at
         FROM rag_chunks
         GROUP BY document_id
         ORDER BY created_at DESC`
    )
    return res.rows.map((row) => ({
      documentId: row.document_id as string,
      name: (row.name as string) ?? "(unknown)",
      chunks: row.chunks as number,
      createdAt: new Date(row.created_at as string).getTime(),
    }))
  }

  async count(): Promise<number> {
    const res = await this.pool.query("SELECT count(*)::int AS n FROM rag_chunks")
    return (res.rows[0]?.n as number) ?? 0
  }
}

/** Serialize a JS number[] into pgvector's `[1,2,3]` text literal. */
function toVector(v: number[]): string {
  return `[${v.join(",")}]`
}
