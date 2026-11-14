import assert from "node:assert/strict"
import { test } from "node:test"
import { clockText, fallbackLine, type Facts, lowTimeMark, materialOf, type MoveInfo, momentsOf, openingOf, shouldSpeak } from "./commentary-rules.js"

const mv = (o: Partial<MoveInfo>): MoveInfo => ({ ply: 10, side: "w", san: "Nf3", piece: "n", captured: null, to: "f3", promotion: null, check: false, castle: null, ...o })
const ctx = (o: Partial<{ leftMs: number; initialMs: number; said: Set<string>; opening: string | null }> = {}) => ({ leftMs: 170_000, initialMs: 180_000, said: new Set<string>(), opening: null, ...o })

test("captures, trades, promotions, checks and castling are what's said", () => {
  assert.deepEqual(momentsOf(mv({ san: "Nxf7", captured: "p" }), null, ctx()), [])
  assert.deepEqual(momentsOf(mv({ san: "Bxf6", captured: "n", to: "f6" }), null, ctx()), ["capture"])
  assert.deepEqual(momentsOf(mv({ san: "gxf6", captured: "b", to: "f6", side: "b" }), mv({ captured: "n", to: "f6" }), ctx()), ["trade"])
  assert.deepEqual(momentsOf(mv({ san: "e8=Q+", promotion: "q", check: true }), null, ctx()), ["promotion", "check"])
  assert.deepEqual(momentsOf(mv({ san: "O-O", castle: "kingside" }), null, ctx()), ["castle"])
  assert.deepEqual(momentsOf(mv({ ply: 1, san: "e4" }), null, ctx()), ["start"])
  assert.deepEqual(momentsOf(mv({ ply: 20 }), null, ctx()), ["milestone"])
})

test("the opening's name once, in the first moves", () => {
  assert.deepEqual(momentsOf(mv({ ply: 8 }), null, ctx({ opening: "Ruy Lopez" })), ["opening"])
  assert.deepEqual(momentsOf(mv({ ply: 8 }), null, ctx({ opening: "Ruy Lopez", said: new Set(["opening"]) })), [])
  assert.deepEqual(momentsOf(mv({ ply: 30 }), null, ctx({ opening: "Ruy Lopez" })), [])
  assert.equal(openingOf(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]), "Ruy Lopez")
  assert.equal(openingOf(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]), "Sicilian Najdorf")
  assert.equal(openingOf(["a3"]), null)
})

test("low time: under a minute, then under 10 seconds, once each", () => {
  assert.equal(lowTimeMark(59_000, 180_000), "low")
  assert.equal(lowTimeMark(9_000, 180_000), "very-low")
  assert.equal(lowTimeMark(14_000, 60_000), "low")
  assert.equal(lowTimeMark(20_000, 60_000), null)
  assert.deepEqual(momentsOf(mv({}), null, ctx({ leftMs: 50_000 })), ["low-time"])
  assert.deepEqual(momentsOf(mv({}), null, ctx({ leftMs: 50_000, said: new Set(["low-w"]) })), [])
})

test("material is a count, clocks as m:ss", () => {
  assert.equal(materialOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").text, "Material is level")
  assert.equal(materialOf("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Asha", "Ravi").text, "Asha has 9 more points of material")
  assert.equal(clockText(65_400), "1:06")
})

test("the commentator doesn't talk over itself", () => {
  assert.equal(shouldSpeak("promotion", 0, 0), true)
  assert.equal(shouldSpeak("trade", 1000, 1), true)
  assert.equal(shouldSpeak("capture", 3000, 1), false)
  assert.equal(shouldSpeak("capture", 6000, 1), true)
  assert.equal(shouldSpeak("check", 10_000, 3), false)
  assert.equal(shouldSpeak("milestone", 30_000, 10), true)
})

const JUDGEMENT = /\b(should|could|must|best|better|worse|mistake|blunder|error|good|bad|strong|weak|winning|losing|advantage|threat|attack|missed|instead)\b/i

test("plain lines only describe what happened", () => {
  const f: Facts = {
    moment: "capture",
    white: "Asha",
    black: "Ravi",
    white_rating: 1500,
    black_rating: 1480,
    time_control: "3+2",
    tournament: null,
    move_no: 20,
    mover: "Asha",
    opponent: "Ravi",
    san: "Bxf6",
    piece: "bishop",
    captured: "knight",
    square: "f6",
    castle: null,
    promoted_to: null,
    check: false,
    opening: "Ruy Lopez",
    material: "Asha has 3 more points of material",
    clocks: { white: "2:10", black: "1:58" },
    mover_clock: "2:10",
  }
  assert.equal(fallbackLine(f), "Asha takes Ravi's knight on f6. Asha has 3 more points of material.")
  for (const moment of ["start", "opening", "capture", "trade", "promotion", "check", "castle", "low-time", "milestone", "end"] as const) {
    const line = fallbackLine({ ...f, moment, castle: "kingside", promoted_to: "queen", result: "0-1", reason: "checkmate" }, 45_000)
    assert.ok(line && !JUDGEMENT.test(line), `${moment}: ${line}`)
  }
})
