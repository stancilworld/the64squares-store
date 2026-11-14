import assert from "node:assert/strict"
import { test } from "node:test"
import { ageOn, canTalk, canWrite, DEFAULT_SETTINGS, isOpen, lobbyWindow, readable, type Who } from "./lobby-rules.js"

const who = (o: Partial<Who> = {}): Who => ({ role: "player", signedIn: true, minor: false, muted: false, removed: false, ...o })
const s = DEFAULT_SETTINGS

test("lobby opens with check-in (30 min at least) and closes an hour after the end", () => {
  const start = Date.UTC(2026, 10, 20, 12)
  const w = lobbyWindow({ starts_at: start, check_in_minutes: 15, ends_at: start + 2 * 3600_000, finished_at: null, cancelled: false })
  assert.equal(isOpen(w, start - 31 * 60_000), false)
  assert.equal(isOpen(w, start - 30 * 60_000), true)
  assert.equal(isOpen(w, start + 3 * 3600_000 - 1), true)
  assert.equal(isOpen(w, start + 3 * 3600_000), false)
  const long = lobbyWindow({ starts_at: start, check_in_minutes: 60, ends_at: null, finished_at: start + 3600_000, cancelled: false })
  assert.equal(isOpen(long, start - 59 * 60_000), true)
  assert.equal(isOpen(long, start + 2 * 3600_000), false)
  assert.equal(isOpen({ ...w, cancelled: true }, start), false)
})

test("spectators never read the players' chat or the arbiter", () => {
  assert.deepEqual(readable("spectator"), ["all", "spectators"])
  assert.ok(readable("player").includes("players"))
})

test("players chat: quick by default, typed only when a moderator opens it", () => {
  assert.equal(canWrite(who(), s, "players", "quick"), null)
  assert.equal(canWrite(who(), s, "players", "text"), "quick-only")
  assert.equal(canWrite(who(), { ...s, players_chat: "open" }, "players", "text"), null)
  assert.equal(canWrite(who(), { ...s, players_chat: "off" }, "players", "quick"), "chat-off")
  assert.equal(canWrite(who({ role: "spectator" }), { ...s, players_chat: "open" }, "players", "quick"), "players-only")
})

test("children send quick messages only, except to the arbiter", () => {
  const kid = who({ minor: true })
  assert.equal(canWrite(kid, { ...s, players_chat: "open" }, "players", "text"), "quick-only")
  assert.equal(canWrite(kid, s, "spectators", "text"), "quick-only")
  assert.equal(canWrite(kid, s, "arbiter", "text"), null)
})

test("only players ask the arbiter; only moderators announce; guests, muted and removed can't write", () => {
  assert.equal(canWrite(who({ role: "spectator" }), s, "arbiter", "text"), "players-only")
  assert.equal(canWrite(who(), s, "all", "announce"), "moderators-only")
  assert.equal(canWrite(who({ role: "moderator" }), s, "all", "announce"), null)
  assert.equal(canWrite(who({ role: "moderator" }), { ...s, players_chat: "off" }, "players", "text"), null)
  assert.equal(canWrite(who({ signedIn: false, role: "spectator" }), s, "spectators", "quick"), "sign-in")
  assert.equal(canWrite(who({ muted: true }), s, "spectators", "quick"), "muted")
  assert.equal(canWrite(who({ removed: true }), s, "arbiter", "text"), "removed")
  assert.equal(canWrite(who({ role: "spectator" }), { ...s, spectator_chat: "off" }, "spectators", "text"), "chat-off")
})

test("age from a date of birth", () => {
  const now = new Date(Date.UTC(2026, 10, 14))
  assert.equal(ageOn("2008-11-14", now), 18)
  assert.equal(ageOn("2008-11-15", now), 17)
  assert.equal(ageOn("bad", now), null)
})

test("lobby voice: moderators talk; adult players when allowed; children by name; spectators listen", () => {
  const on = { ...DEFAULT_SETTINGS, voice_on: true }
  const p = { role: "player" as const, adult: true, muted: false, removed: false }
  assert.equal(canTalk({ ...p, role: "moderator" }, on, false), null)
  assert.equal(canTalk(p, on, false), "not-allowed")
  assert.equal(canTalk(p, { ...on, players_voice: true }, false), null)
  assert.equal(canTalk({ ...p, adult: false }, { ...on, players_voice: true }, false), "ask-moderator")
  assert.equal(canTalk({ ...p, adult: false }, on, true), null)
  assert.equal(canTalk({ ...p, role: "spectator" }, { ...on, players_voice: true }, true), "listen-only")
  assert.equal(canTalk({ ...p, muted: true }, { ...on, players_voice: true }, true), "muted")
  assert.equal(canTalk({ ...p, role: "moderator" }, DEFAULT_SETTINGS, false), "voice-off")
})
