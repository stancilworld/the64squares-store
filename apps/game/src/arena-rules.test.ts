import assert from "node:assert/strict"
import { test } from "node:test"
import { applyResult, emptyStanding, pairPool, rank } from "./arena-rules.js"

test("scoring: 2 for a win, 1 for a draw, doubled after two wins in a row", () => {
  const s = emptyStanding("cus_a", "A", 0)
  assert.equal(applyResult(s, "win", "w", "x"), 2)
  assert.equal(applyResult(s, "win", "b", "y"), 2)
  assert.equal(applyResult(s, "win", "w", "z"), 4)
  assert.equal(applyResult(s, "draw", "b", "x"), 2)
  assert.equal(applyResult(s, "win", "w", "y"), 2)
  assert.equal(applyResult(s, "loss", "b", "z"), 0)
  assert.deepEqual(s.sheet, [2, 2, 4, 2, 2, 0])
  assert.equal(s.score, 12)
  assert.equal(s.streak, 0)
  assert.equal(s.whites, 3)
  assert.equal(s.blacks, 3)
})

test("standings: score, then wins, then fewer games", () => {
  const a = { ...emptyStanding("a", "A", 1), score: 4, wins: 2, games: 3 }
  const b = { ...emptyStanding("b", "B", 2), score: 4, wins: 2, games: 2 }
  const c = { ...emptyStanding("c", "C", 3), score: 6, wins: 3, games: 3 }
  assert.deepEqual(rank([a, b, c]).map((s) => s.player_id), ["c", "b", "a"])
})

test("pairing: neighbours in the standings, no immediate rematch, fair colours", () => {
  const p = (id: string, score: number, last: string | null = null, whites = 0, blacks = 0) => ({
    ...emptyStanding(id, id, 0),
    score,
    last_opponent: last,
    whites,
    blacks,
  })
  const pairs = pairPool([p("a", 10, "b"), p("b", 9, "a"), p("c", 8), p("d", 7)])
  const names = pairs.map((x) => [x.white.player_id, x.black.player_id].sort().join("-")).sort()
  assert.deepEqual(names, ["a-c", "b-d"])

  // Only two players left: they may play again.
  assert.equal(pairPool([p("a", 1, "b"), p("b", 1, "a")]).length, 1)

  // The one who had more whites gets black.
  const [one] = pairPool([p("a", 1, null, 3, 1), p("b", 1, null, 1, 3)])
  assert.equal(one.white.player_id, "b")

  // Odd one out waits.
  assert.equal(pairPool([p("a", 1), p("b", 1), p("c", 1)]).length, 1)
})
