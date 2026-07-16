import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { cosine } from "../math"
import type {
  DocumentInfo,
  SearchHit,
  VectorRecord,
  VectorStore,
} from "../types"

/**
 * Zero-dependency local vector store for testing. Holds all records in memory,
 * persists them to a single JSON file, and does brute-force cosine search.
 *
 * Fine for hundreds/low-thousands of chunks. For production scale + concurrency,
 * switch `VECTOR_STORE=pgvector` — same {@link VectorStore} interface.
 */
export class LocalVectorStore implements VectorStore {
  readonly kind = "local"
  private records: VectorRecord[] = []
  private loaded = false

  constructor(private readonly file: string) {}

  async init(): Promise<void> {
    if (this.loaded) return
    try {
      this.records = JSON.parse(await readFile(this.file, "utf8")) as VectorRecord[]
    } catch {
      this.records = [] // no file yet → empty store
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify(this.records))
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    const byId = new Map(this.records.map((r) => [r.id, r]))
    for (const r of records) byId.set(r.id, r)
    this.records = [...byId.values()]
    await this.persist()
  }

  async search(embedding: number[], topK: number): Promise<SearchHit[]> {
    return this.records
      .map((r) => ({
        id: r.id,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        text: r.text,
        metadata: r.metadata,
        score: cosine(embedding, r.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  async deleteDocument(documentId: string): Promise<void> {
    const before = this.records.length
    this.records = this.records.filter((r) => r.documentId !== documentId)
    if (this.records.length !== before) await this.persist()
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    const byDoc = new Map<string, DocumentInfo>()
    for (const r of this.records) {
      const existing = byDoc.get(r.documentId)
      if (existing) existing.chunks++
      else
        byDoc.set(r.documentId, {
          documentId: r.documentId,
          name: r.metadata.name,
          chunks: 1,
          createdAt: r.metadata.createdAt,
        })
    }
    return [...byDoc.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  async count(): Promise<number> {
    return this.records.length
  }
}
