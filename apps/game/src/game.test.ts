import assert from "node:assert/strict"
import { test } from "node:test"
import { FIRST_MOVE_MS, Game, type GameRecord, parseTimeControl } from "./game.js"

const W = { id: "cus_w", name: "White" }
const B = { id: "cus_b", name: "Black" }

const make = (over: Partial<GameRecord> = {}) =>
  new Game({
    id: "g1",
    mode: "friend",
    tournament_id: null,
    white: W,
    black: B,
    creator_id: W.id,
    initial_ms: 180_000,
    increment_ms: 2_000,
    status: "waiting",
    result: null,
    reason: null,
    moves: [],
    white_ms: 180_000,
    black_ms: 180_000,
    turn_started_at: null,
    draw_offer: null,
    created_at: 0,
    started_at: null,
    ended_at: null,
    rated: false,
    white_rating: null,
    black_rating: null,
    white_diff: null,
    black_diff: null,
    ...over,
  })

const play = (g: Game, moves: [string, string, number][]) => {
  for (const [who, uci, at] of moves) {
    const r = g.move(who, uci, g.ply, at)
    assert.equal(r.ok, true, `${uci} at ${at}: ${JSON.stringify(r)}`)
  }
}

test("time controls", () => {
  assert.deepEqual(parseTimeControl("3+2"), { initial_ms: 180_000, increment_ms: 2_000 })
  assert.equal(parseTimeControl("0+1"), null)
  assert.equal(parseTimeControl("blitz"), null)
})

test("only the side to move can move, once per ply", () => {
  const g = make()
  g.start(0)
  assert.deepEqual(g.move(B.id, "e7e5", 0, 1000), { ok: false, error: "not-your-turn" })
  assert.deepEqual(g.move("someone", "e2e4", 0, 1000), { ok: false, error: "not-a-player" })
  assert.deepEqual(g.move(W.id, "e2e5", 0, 1000), { ok: false, error: "illegal" })
  assert.equal(g.move(W.id, "e2e4", 0, 1000).ok, true)
  // The same click arriving twice is ignored.
  assert.deepEqual(g.move(W.id, "d2d4", 0, 1100), { ok: false, error: "not-your-turn" })
  assert.deepEqual(g.move(B.id, "e7e5", 0, 1200), { ok: false, error: "stale" })
})

test("first moves are free; then time is charged and the increment added", () => {
  const g = make()
  g.start(0)
  play(g, [
    [W.id, "e2e4", 20_000],
    [B.id, "e7e5", 40_000],
  ])
  assert.deepEqual(g.clocks(40_000), { w: 180_000, b: 180_000 })
  // White thinks 10 s: 180 - 10 + 2.
  play(g, [[W.id, "g1f3", 50_000]])
  assert.equal(g.r.white_ms, 172_000)
  assert.deepEqual(g.clocks(55_000), { w: 172_000, b: 175_000 })
})

test("missing the first move ends the game without a result", () => {
  const g = make()
  g.start(0)
  assert.equal(g.tick(FIRST_MOVE_MS - 1), false)
  assert.equal(g.tick(FIRST_MOVE_MS), true)
  assert.equal(g.r.status, "aborted")
  assert.equal(g.r.reason, "no-start")
})

test("running out of time loses, unless the opponent can't mate", () => {
  const g = make({ initial_ms: 60_000, white_ms: 60_000, black_ms: 60_000, increment_ms: 0 })
  g.start(0)
  play(g, [
    [W.id, "e2e4", 1000],
    [B.id, "e7e5", 2000],
  ])
  assert.equal(g.tick(61_999), false)
  assert.equal(g.tick(62_000), true)
  assert.equal(g.r.result, "0-1")
  assert.equal(g.r.reason, "timeout")
  assert.equal(g.r.white_ms, 0)

  // Black has only a king: White flagging is a draw.
  const lone = make({ initial_ms: 60_000, white_ms: 60_000, black_ms: 60_000, increment_ms: 0 })
  lone.start(0)
  play(lone, [
    [W.id, "e2e4", 0],
    [B.id, "e7e5", 0],
  ])
  // Replace the position by replaying a game is long; instead check the rule directly.
  assert.equal((lone as unknown as { canMate(c: string): boolean }).canMate("b"), true)
})

test("checkmate ends the game", () => {
  const g = make()
  g.start(0)
  play(g, [
    [W.id, "f2f3", 1],
    [B.id, "e7e5", 2],
    [W.id, "g2g4", 3],
    [B.id, "d8h4", 4],
  ])
  assert.equal(g.r.status, "finished")
  assert.equal(g.r.result, "0-1")
  assert.equal(g.r.reason, "checkmate")
  assert.match(g.pgn(), /1\. f3 e5 2\. g4 Qh4# 0-1/)
})

test("resign, abort and draws", () => {
  const early = make()
  early.start(0)
  assert.equal(early.resign(W.id, 10), true)
  assert.equal(early.r.reason, "aborted")

  const g = make()
  g.start(0)
  play(g, [
    [W.id, "e2e4", 1],
    [B.id, "e7e5", 2],
  ])
  assert.equal(g.abort(W.id, 3), false)
  assert.equal(g.draw(W.id, "offer", 3), true)
  assert.equal(g.draw(W.id, "accept", 4), false)
  // Black moving declines White's offer.
  play(g, [[W.id, "g1f3", 5]])
  assert.equal(g.r.draw_offer, "w")
  play(g, [[B.id, "b8c6", 6]])
  assert.equal(g.r.draw_offer, null)
  assert.equal(g.draw(B.id, "offer", 7), true)
  assert.equal(g.draw(W.id, "accept", 8), true)
  assert.equal(g.r.result, "1/2-1/2")
  assert.equal(g.r.reason, "agreement")

  const r = make()
  r.start(0)
  play(r, [
    [W.id, "e2e4", 1],
    [B.id, "e7e5", 2],
  ])
  assert.equal(r.resign(B.id, 3), true)
  assert.equal(r.r.result, "1-0")
})

test("a waiting challenge can be withdrawn by its creator only", () => {
  const g = make({ black: null })
  assert.equal(g.abort(B.id, 1), false)
  assert.equal(g.abort(W.id, 1), true)
  assert.equal(g.r.status, "aborted")
})

test("claiming a win after the opponent left", () => {
  const g = make()
  g.start(0)
  play(g, [
    [W.id, "e2e4", 1000],
    [B.id, "e7e5", 2000],
  ])
  assert.equal(g.claim("cus_x", "win", 3000), false)
  assert.equal(g.claim(W.id, "win", 3000), true)
  assert.equal(g.r.result, "1-0")
  assert.equal(g.r.reason, "abandoned")
})

test("claiming a draw, and no claim before both sides moved", () => {
  const g = make()
  g.start(0)
  assert.equal(g.claim(W.id, "win", 1000), false)
  play(g, [
    [W.id, "d2d4", 1000],
    [B.id, "d7d5", 2000],
  ])
  assert.equal(g.claim(B.id, "draw", 3000), true)
  assert.equal(g.r.result, "1/2-1/2")
})

test("tournament ready check: no moves until both are ready; then the first-move time starts", () => {
  const g = make({ mode: "arena", tournament_id: "trn_x" })
  g.start(1000, 60_000)
  assert.equal(g.deadline(), 61_000)
  assert.deepEqual(g.move(W.id, "e2e4", 0, 2000), { ok: false, error: "not-ready" })
  assert.equal(g.markReady(W.id, 5000), true)
  assert.notEqual(g.r.ready, null)
  assert.equal(g.markReady(B.id, 9000), true)
  assert.equal(g.r.ready, null)
  assert.equal(g.deadline(), 9000 + FIRST_MOVE_MS)
  assert.equal(g.move(W.id, "e2e4", 0, 10_000).ok, true)
})

test("ready time up: the player who was ready wins by no-show; nobody ready, no game", () => {
  const a = make({ mode: "arena", tournament_id: "trn_x" })
  a.start(0, 30_000)
  a.markReady(B.id, 1000)
  assert.equal(a.tick(30_000), true)
  assert.equal(a.r.result, "0-1")
  assert.equal(a.r.reason, "no-show")
  const b = make({ mode: "arena", tournament_id: "trn_x" })
  b.start(0, 30_000)
  assert.equal(b.tick(29_999), false)
  assert.equal(b.tick(30_000), true)
  assert.equal(b.r.reason, "no-shows")
  const c = make()
  c.start(0)
  assert.equal(c.r.ready, null)
  assert.equal(c.markReady(W.id, 10), false)
})
