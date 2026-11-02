import assert from "node:assert/strict"
import { test } from "node:test"
import { pickPairs } from "./seek-rules.js"

test("pairs the closest ratings and leaves a far-apart player waiting", () => {
  const now = 10_000
  const s = (id: string, rating: number, since = now) => ({ id, rating, since })
  const pairs = pickPairs([s("a", 1500), s("b", 2100), s("c", 1540)], now)
  assert.equal(pairs.length, 1)
  assert.deepEqual(pairs[0].map((p) => p.id).sort(), ["a", "c"])
})

test("the gap widens with waiting time", () => {
  const now = 100_000
  const pairs = pickPairs([{ id: "a", rating: 1200, since: now - 30_000 }, { id: "b", rating: 1900, since: now - 30_000 }], now)
  assert.equal(pairs.length, 1)
})
