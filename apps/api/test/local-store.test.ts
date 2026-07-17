import { test } from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { LocalVectorStore } from "../src/rag/stores/local-store"
import type { VectorRecord } from "../src/rag/types"

function rec(
  documentId: string,
  chunkIndex: number,
  embedding: number[],
  name = "doc.txt"
): VectorRecord {
  const id = `${documentId}:${chunkIndex}`
  return {
    id,
    documentId,
    chunkIndex,
    text: `text ${id}`,
    embedding,
    metadata: { name, createdAt: chunkIndex + 1 },
  }
}

function tmpFile(): string {
  return join(tmpdir(), `vs-${randomUUID()}.json`)
}

test("upsert + count + cosine search ordering", async () => {
  const file = tmpFile()
  const s = new LocalVectorStore(file)
  await s.init()
  await s.upsert([
    rec("a", 0, [1, 0]),
    rec("b", 0, [0, 1]),
    rec("c", 0, [0.9, 0.1]),
  ])
  assert.equal(await s.count(), 3)

  const hits = await s.search([1, 0], 2)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.id, "a:0") // exact match ranks first
  assert.equal(hits[1]!.id, "c:0") // near match second
  assert.ok(hits[0]!.score > hits[1]!.score)

  await rm(file, { force: true })
})

test("upsert replaces a record with the same id", async () => {
  const file = tmpFile()
  const s = new LocalVectorStore(file)
  await s.init()
  await s.upsert([rec("a", 0, [1, 0])])
  await s.upsert([{ ...rec("a", 0, [0, 1]), text: "updated" }])
  assert.equal(await s.count(), 1)
  const [hit] = await s.search([0, 1], 1)
  assert.equal(hit!.text, "updated")
  await rm(file, { force: true })
})

test("deleteDocument removes all chunks of that document only", async () => {
  const file = tmpFile()
  const s = new LocalVectorStore(file)
  await s.init()
  await s.upsert([rec("a", 0, [1, 0]), rec("a", 1, [1, 0]), rec("b", 0, [0, 1])])
  await s.deleteDocument("a")
  assert.equal(await s.count(), 1)
  const docs = await s.listDocuments()
  assert.equal(docs.length, 1)
  assert.equal(docs[0]!.documentId, "b")
})

test("listDocuments dedupes by documentId and counts chunks", async () => {
  const file = tmpFile()
  const s = new LocalVectorStore(file)
  await s.init()
  await s.upsert([rec("a", 0, [1, 0]), rec("a", 1, [1, 0]), rec("b", 0, [0, 1])])
  const docs = await s.listDocuments()
  const a = docs.find((d) => d.documentId === "a")!
  assert.equal(a.chunks, 2)
  await rm(file, { force: true })
})

test("data persists across store instances (JSON file)", async () => {
  const file = tmpFile()
  const s1 = new LocalVectorStore(file)
  await s1.init()
  await s1.upsert([rec("a", 0, [1, 0])])

  const s2 = new LocalVectorStore(file)
  await s2.init()
  assert.equal(await s2.count(), 1)
  const [hit] = await s2.search([1, 0], 1)
  assert.equal(hit!.id, "a:0")

  await rm(file, { force: true })
})
