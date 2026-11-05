import assert from "node:assert/strict"
import { test } from "node:test"
import { cleanText } from "./chat.js"

test("chat text is cleaned", () => {
  assert.equal(cleanText("  good   game\n"), "good game")
  assert.equal(cleanText("you are a chutiya"), "you are a ******")
  assert.equal(cleanText("Fuck this"), "**** this")
  assert.equal(cleanText("call me 98765 43210"), "call me •••")
  assert.equal(cleanText("see www.example.com now"), "see ••• now")
  assert.equal(cleanText("well played, classic opening"), "well played, classic opening")
  assert.equal(cleanText("x".repeat(300)).length, 140)
})
