import assert from "node:assert/strict"
import { test } from "node:test"
import { classify, evalWords, fallbackLine, type Facts, lossOf, materialOf, openingOf, shouldSpeak } from "./commentary-rules.js"

test("a move's loss is from the mover's side", () => {
  assert.equal(lossOf("w", 50, -300), 350)
  assert.equal(lossOf("b", 50, 400), 350)
  assert.equal(lossOf("b", 50, -100), -150)
})

test("blunders, mistakes and turnarounds; nothing in a decided game", () => {
  assert.equal(classify(350, 20, -330, "w"), "turnaround")
  assert.equal(classify(320, 600, 280, "w"), "blunder")
  assert.equal(classify(180, 100, -80, "w"), "mistake")
  assert.equal(classify(60, 30, -30, "w"), null)
  assert.equal(classify(400, 1000, 950, "w"), null)
  assert.equal(classify(300, -10, 290, "b"), "turnaround")
})

test("eval in words and material", () => {
  assert.equal(evalWords(30, "A", "B"), "roughly level")
  assert.equal(evalWords(-400, "A", "B"), "B is clearly better")
  assert.equal(evalWords(1000, "A", "B"), "A is winning")
  assert.equal(materialOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").text, "material is level")
  assert.equal(materialOf("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").text, "White is up 9 points of material")
})

test("openings by their first moves, longest match", () => {
  assert.equal(openingOf(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]), "Ruy Lopez")
  assert.equal(openingOf(["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]), "Sicilian Najdorf")
  assert.equal(openingOf(["e4", "c5"]), "Sicilian Defence")
  assert.equal(openingOf(["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"]), "King's Indian Defence")
  assert.equal(openingOf(["a3"]), null)
  assert.equal(openingOf(["c4"]), "English Opening")
})

test("the commentator doesn't talk over itself", () => {
  assert.equal(shouldSpeak("blunder", 0, 0), true)
  assert.equal(shouldSpeak("mistake", 3000, 1), false)
  assert.equal(shouldSpeak("mistake", 7000, 1), true)
  assert.equal(shouldSpeak("check", 10_000, 3), false)
  assert.equal(shouldSpeak("quiet", 30_000, 4), false)
  assert.equal(shouldSpeak("quiet", 30_000, 10), true)
})

test("fallback lines never name a better move", () => {
  const f: Facts = {
    moment: "blunder",
    white: "Asha",
    black: "Ravi",
    white_rating: 1500,
    black_rating: 1480,
    time_control: "3+2",
    tournament: null,
    move_no: 20,
    side: "White",
    mover: "Asha",
    san: "Qxb7",
    recent: [],
    opening: null,
    eval_white: -500,
    material: "material is level",
    clocks: { white_s: 40, black_s: 50 },
    featured: false,
  }
  const line = fallbackLine(f)
  assert.match(line, /Qxb7/)
  assert.match(line, /Ravi is clearly better/)
  assert.equal(fallbackLine({ ...f, moment: "end", result: "0-1", reason: "checkmate" }), "And that's the game: Ravi wins by checkmate. Well played, both.")
})
