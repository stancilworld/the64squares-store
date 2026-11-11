import assert from "node:assert/strict"
import { test } from "node:test"
import { Chess } from "chess.js"
import { bookMove, type Candidate, chooseMove, complexityOf, shouldResign, thinkMs } from "./house/brain.js"
import { houseWaitMs, targetFrom } from "./house/level.js"
import { OPENINGS } from "./house/openings.js"
import { isHouse, makePersona, rng } from "./house/persona.js"

test("every opening line is legal chess", () => {
  for (const o of OPENINGS) {
    for (const line of o.lines) {
      const c = new Chess()
      for (const m of line.split(" ")) assert.doesNotThrow(() => c.move(m), `${o.key}: ${line} at ${m}`)
    }
  }
})

test("personas are stable, varied and mostly unique", () => {
  assert.deepEqual(makePersona(42), makePersona(42))
  const ps = Array.from({ length: 1200 }, (_, i) => makePersona(i + 1))
  const usernames = new Set(ps.map((p) => p.username))
  assert.ok(usernames.size > 1100, `unique usernames: ${usernames.size}`)
  const names = new Set(ps.map((p) => p.display_name))
  assert.ok(names.size > 900, `distinct names: ${names.size}`)
  for (const p of ps) {
    assert.match(p.username, /^[a-z0-9_]{3,20}$/)
    assert.ok(p.strength >= 400 && p.strength <= 2400)
    assert.ok(p.repertoire.white.length && p.repertoire.black.length)
  }
  const countries = new Set(ps.map((p) => p.country))
  assert.ok(countries.size >= 20)
  const india = ps.filter((p) => p.country === "IN").length / ps.length
  assert.ok(india > 0.25 && india < 0.5, `India share ${india}`)
  // Strengths cover every level, with most players in the middle.
  const band = (lo: number, hi: number) => ps.filter((p) => p.strength >= lo && p.strength < hi).length
  for (const [lo, hi] of [[400, 800], [800, 1200], [1200, 1600], [1600, 2000], [2000, 2401]]) assert.ok(band(lo, hi) >= 20, `${lo}-${hi}: ${band(lo, hi)}`)
  assert.ok(isHouse("house_00a1") && !isHouse("cus_123"))
})

test("a persona follows its own openings, then stops", () => {
  const p = { strength: 1500, repertoire: { white: ["london"], black: ["caro", "slav", "vs-flank"] } }
  const r = rng(1)
  assert.equal(bookMove([], p, "w", r), "d4")
  assert.equal(bookMove(["e4"], p, "b", r), "c6")
  assert.equal(bookMove(["d4", "d5"], p, "w", r), "Bf4")
  // Out of its lines: thinks for itself.
  assert.equal(bookMove(["e4", "c6", "Bc4"], p, "b", r), null)
  // A beginner leaves the book early.
  assert.equal(bookMove(["d4", "d5", "Bf4", "Nf6", "e3", "c5"], { ...p, strength: 400 }, "w", r), null)
})

const cand = (uci: string, cp: number, extra: Partial<Candidate> = {}): Candidate => ({ uci, san: uci, cp, capture: false, check: false, quiet: true, ...extra })

test("stronger players pick the best move more often", () => {
  const cands = [cand("a", 50), cand("b", 20), cand("c", -40), cand("d", -150), cand("e", -400)]
  const bestShare = (strength: number) => {
    const r = rng(strength)
    let n = 0
    for (let i = 0; i < 4000; i++) if (chooseMove(cands, { strength, aggression: 0, pressure: 0 }, r).uci === "a") n++
    return n / 4000
  }
  const weak = bestShare(500)
  const mid = bestShare(1300)
  const strong = bestShare(2300)
  assert.ok(weak < mid && mid < strong, `${weak} ${mid} ${strong}`)
  assert.ok(strong > 0.5)
  assert.ok(weak < 0.4)
})

test("mate in one is almost always found by decent players", () => {
  const cands = [cand("m", 9990), cand("x", 30), cand("y", 10)]
  const r = rng(7)
  let n = 0
  for (let i = 0; i < 1000; i++) if (chooseMove(cands, { strength: 1400, aggression: 0, pressure: 0 }, r).uci === "m") n++
  assert.ok(n > 900)
})

test("time pressure causes more mistakes", () => {
  const cands = [cand("a", 40), cand("b", -60), cand("c", -200), cand("d", -500)]
  const share = (pressure: number) => {
    const r = rng(3)
    let n = 0
    for (let i = 0; i < 4000; i++) if (chooseMove(cands, { strength: 1400, aggression: 0, pressure }, r).uci === "a") n++
    return n / 4000
  }
  assert.ok(share(1) < share(0))
})

test("thinking time suits the time control and the position", () => {
  const avg = (initial_ms: number, increment_ms: number, complexity: number, book = false) => {
    const r = rng(11)
    let sum = 0
    for (let i = 0; i < 2000; i++) sum += thinkMs({ initial_ms, increment_ms, left_ms: initial_ms * 0.8, opp_left_ms: initial_ms * 0.8, ply: 24, complexity, book, pace: 1 }, r)
    return sum / 2000
  }
  const bullet = avg(60_000, 0, 0.5)
  const blitz = avg(180_000, 2000, 0.5)
  const rapid = avg(600_000, 0, 0.5)
  assert.ok(bullet < 2500, `bullet ${bullet}`)
  assert.ok(bullet < blitz && blitz < rapid, `${bullet} ${blitz} ${rapid}`)
  assert.ok(rapid > 6000 && rapid < 40_000, `rapid ${rapid}`)
  assert.ok(avg(600_000, 0, 0.1) < avg(600_000, 0, 0.9), "hard positions take longer")
  assert.ok(avg(600_000, 0, 0.5, true) < rapid, "known opening moves are quicker")
  // Never more than a third of what's left, never instant.
  const r = rng(5)
  for (let i = 0; i < 500; i++) {
    const t = thinkMs({ initial_ms: 60_000, increment_ms: 0, left_ms: 4000, opp_left_ms: 9000, ply: 80, complexity: 1, book: false, pace: 1.3 }, r)
    assert.ok(t >= 220 && t <= 1400, `low time ${t}`)
  }
  // The first move comes within the 30-second limit.
  for (let i = 0; i < 200; i++) assert.ok(thinkMs({ initial_ms: 600_000, increment_ms: 0, left_ms: 600_000, opp_left_ms: 600_000, ply: 0, complexity: 0.3, book: true, pace: 1.3 }, r) < 5000)
})

test("thinking times vary like a person's", () => {
  const r = rng(9)
  const ts = Array.from({ length: 300 }, () => thinkMs({ initial_ms: 300_000, increment_ms: 0, left_ms: 250_000, opp_left_ms: 250_000, ply: 30, complexity: 0.5, book: false, pace: 1 }, r))
  const mean = ts.reduce((s, t) => s + t, 0) / ts.length
  const sd = Math.sqrt(ts.reduce((s, t) => s + (t - mean) ** 2, 0) / ts.length)
  assert.ok(sd / mean > 0.3, `spread ${sd / mean}`)
})

test("obvious moves are easy, close choices are hard", () => {
  assert.ok(complexityOf([cand("a", 300), cand("b", -50)], 30) < complexityOf([cand("a", 20), cand("b", 15), cand("c", 10), cand("d", 5)], 35))
  assert.equal(complexityOf([cand("a", 0)], 1), 0)
})

test("resigning: only when clearly lost for a while, never vs a flag", () => {
  const r = () => 0.1
  assert.equal(shouldResign({ evalHistory: [-2000, -2100, -2200], resigns: 0.8, strength: 1600, opp_left_ms: 60_000 }, r), true)
  assert.equal(shouldResign({ evalHistory: [-2000, -100, -2200], resigns: 0.8, strength: 1600, opp_left_ms: 60_000 }, r), false)
  assert.equal(shouldResign({ evalHistory: [-2000, -2100, -2200], resigns: 0.8, strength: 1600, opp_left_ms: 10_000 }, r), false)
  assert.equal(shouldResign({ evalHistory: [-2000, -2100, -2200], resigns: 0.05, strength: 600, opp_left_ms: 60_000 }, r), false)
})

test("level matching: new players start gently, losing runs get easier games", () => {
  assert.equal(targetFrom({ rating: 1500, games: 0, recent: [] }), 1200)
  const losing = targetFrom({ rating: 1300, games: 20, recent: Array.from({ length: 6 }, () => ({ score: 0, opp: 1300 })) })
  const winning = targetFrom({ rating: 1300, games: 20, recent: Array.from({ length: 6 }, () => ({ score: 1, opp: 1300 })) })
  assert.ok(losing < 1300 && winning > 1300)
  assert.ok(losing >= 1100 && winning <= 1500)
  for (let i = 0; i < 100; i++) {
    const w = houseWaitMs()
    assert.ok(w >= 20_000 && w <= 45_000)
  }
})
