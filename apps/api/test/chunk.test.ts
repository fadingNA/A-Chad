import { test } from "node:test"
import assert from "node:assert/strict"
import { chunkText } from "../src/rag/chunk"

test("empty / whitespace-only text yields no chunks", () => {
  assert.deepEqual(chunkText(""), [])
  assert.deepEqual(chunkText("   \n\n  \t "), [])
})

test("short text stays a single chunk", () => {
  const out = chunkText("Hello world.\n\nSecond paragraph.", { size: 1000 })
  assert.equal(out.length, 1)
  assert.match(out[0]!, /Hello world/)
  assert.match(out[0]!, /Second paragraph/)
})

test("long text splits into multiple bounded chunks", () => {
  const para = "word ".repeat(100).trim() // ~499 chars
  const text = Array.from({ length: 6 }, () => para).join("\n\n")
  const out = chunkText(text, { size: 600, overlap: 50 })
  assert.ok(out.length > 1, `expected multiple chunks, got ${out.length}`)
  for (const c of out) assert.ok(c.length <= 700, `chunk too big: ${c.length}`)
})

test("overlap duplicates some content across chunks", () => {
  const paras = Array.from({ length: 20 }, (_, i) => `p${i} ${"x".repeat(40)}`)
  const text = paras.join("\n\n")
  const total = (a: string[]) => a.reduce((n, c) => n + c.length, 0)
  const noOverlap = chunkText(text, { size: 200, overlap: 0 })
  const withOverlap = chunkText(text, { size: 200, overlap: 80 })
  assert.ok(
    total(withOverlap) > total(noOverlap),
    "overlap should carry content into the next chunk"
  )
})

test("a single oversized paragraph is hard-split", () => {
  const out = chunkText("z".repeat(2000), { size: 500, overlap: 50 })
  assert.ok(out.length >= 4, `expected >=4 windows, got ${out.length}`)
})
