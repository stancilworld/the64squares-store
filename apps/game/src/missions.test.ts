import assert from "node:assert/strict"
import { test } from "node:test"
import { indiaDay, missionsFor } from "./missions-rules.js"

test("india day rolls over at midnight IST", () => {
  assert.equal(indiaDay(Date.parse("2026-11-05T18:29:00Z")), "2026-11-05")
  assert.equal(indiaDay(Date.parse("2026-11-05T18:31:00Z")), "2026-11-06")
})

test("three missions a day, one from each group, stable for the day", () => {
  const a = missionsFor("cus_abc", "2026-11-05")
  assert.equal(a.length, 3)
  assert.deepEqual(a.map((m) => m.id), missionsFor("cus_abc", "2026-11-05").map((m) => m.id))
  assert.ok(["play3", "rapid1"].includes(a[0].id))
  assert.ok(["win1", "bot4"].includes(a[1].id))
  assert.ok(["puzzles5", "daily"].includes(a[2].id))
})
