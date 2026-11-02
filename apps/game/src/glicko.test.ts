import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_RATING, speedOf, update } from "./glicko.js"

test("matches Glickman's worked example (one game of three)", () => {
  // Player 1500/200 beats a 1400/30 player.
  const r = update({ rating: 1500, rd: 200, vol: 0.06 }, { rating: 1400, rd: 30, vol: 0.06 }, 1)
  assert.ok(r.rating > 1550 && r.rating < 1580, String(r.rating))
  assert.ok(r.rd < 200)
})

test("new players move a lot, winners gain and losers lose the same direction", () => {
  const a = update(DEFAULT_RATING, DEFAULT_RATING, 1)
  const b = update(DEFAULT_RATING, DEFAULT_RATING, 0)
  assert.ok(a.rating > 1650 && b.rating < 1350)
  const d = update(DEFAULT_RATING, DEFAULT_RATING, 0.5)
  assert.equal(Math.round(d.rating), 1500)
})

test("speed categories", () => {
  assert.equal(speedOf(60_000, 0), "bullet")
  assert.equal(speedOf(180_000, 2000), "blitz")
  assert.equal(speedOf(600_000, 5000), "rapid")
  assert.equal(speedOf(1_800_000, 20_000), "classical")
})
