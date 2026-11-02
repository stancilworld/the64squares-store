import assert from "node:assert/strict"
import { test } from "node:test"
import { analysePlayer, expectedAccuracy, gameRisk, moveAccuracy, shouldFlag } from "./fairplay-rules.js"

test("move accuracy: a perfect move is 100, a blunder is near 0", () => {
  assert.ok(moveAccuracy(30, 30) > 99)
  assert.ok(moveAccuracy(50, -600) < 15)
  assert.ok(moveAccuracy(50, -900) < 10)
})

test("analysis skips opening and forced moves, counts engine matches", () => {
  const evals = Array.from({ length: 41 }, (_, i) => ({ cp: 20, best: i % 2 ? "e7e5" : "e2e4", forced: i === 10 }))
  const uci = Array.from({ length: 40 }, (_, i) => (i % 2 ? "e7e5" : "e2e4"))
  const a = analysePlayer(evals, uci, "w", Array(40).fill(3000))
  assert.equal(a.analysed, 15) // plies 8..38 by white = 16, minus the forced one
  assert.equal(a.match_pct, 100)
})

test("risk: engine-like play at a low rating is flagged, normal play is not", () => {
  const cheat = gameRisk({ analysed: 30, accuracy: 97, match_pct: 88, acpl: 6, time_cv: 0.2, rating: 1300, focus_losses: 5, away_ms: 60000 })
  assert.ok(cheat.risk >= 75, String(cheat.risk))
  const normal = gameRisk({ analysed: 30, accuracy: expectedAccuracy(1500) + 3, match_pct: 45, acpl: 45, time_cv: 0.9, rating: 1500, focus_losses: 0, away_ms: 0 })
  assert.equal(normal.risk, 0)
  assert.equal(shouldFlag([cheat.risk]), true)
  assert.equal(shouldFlag([normal.risk, 10, 20]), false)
})
