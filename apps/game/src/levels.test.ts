import assert from "node:assert/strict"
import { test } from "node:test"
import { levelFor, xpForGame, xpForLevel } from "./levels.js"

test("levels and titles", () => {
  assert.equal(levelFor(0).level, 1)
  assert.equal(levelFor(99).level, 1)
  assert.equal(levelFor(100).level, 2)
  assert.equal(levelFor(xpForLevel(5)).title, "Knight")
  assert.equal(levelFor(xpForLevel(40)).title, "Grandmaster")
  const l = levelFor(150)
  assert.equal(l.into, 50)
  assert.equal(l.needed, 200)
})

test("xp per game", () => {
  assert.equal(xpForGame({ result: "win", mode: "online", plies: 30 }), 30)
  assert.equal(xpForGame({ result: "loss", mode: "arena", plies: 30 }), 15)
  assert.equal(xpForGame({ result: "win", mode: "online", plies: 2 }), 0)
  assert.equal(xpForGame({ result: "win", mode: "computer", computerLevel: 8, plies: 40 }), 32)
})
