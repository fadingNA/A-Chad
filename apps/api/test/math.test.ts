import { test } from "node:test"
import assert from "node:assert/strict"
import { cosine } from "../src/rag/math"

test("cosine of identical vectors is 1", () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9)
})

test("cosine of orthogonal vectors is 0", () => {
  assert.equal(cosine([1, 0], [0, 1]), 0)
})

test("cosine of opposite vectors is -1", () => {
  assert.ok(Math.abs(cosine([1, 1], [-1, -1]) + 1) < 1e-9)
})

test("cosine with a zero vector is 0 (no NaN)", () => {
  assert.equal(cosine([0, 0], [1, 1]), 0)
})

test("cosine is scale-invariant", () => {
  assert.ok(Math.abs(cosine([1, 0], [10, 0]) - 1) < 1e-9)
})
