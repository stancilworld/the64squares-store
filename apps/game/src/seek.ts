import crypto from "node:crypto"
import type { Server, Socket } from "socket.io"
import { getRating } from "./db.js"
import { banOf } from "./fairplay.js"
import { isGuest, parseTimeControl, type Player } from "./game.js"
import { PROVISIONAL_RD, speedOf } from "./glicko.js"
import type { GameManager } from "./manager.js"
import { pickPairs } from "./seek-rules.js"
import { isHouse } from "./house/persona.js"
import { pickHouse } from "./house/store.js"
import { getProfile, publicProfile } from "./profiles.js"
import { houseWaitMs, targetRating } from "./house/matching.js"

// "Play online": players wait in a pool per time control and are paired with someone close
// in rating. The allowed gap widens the longer they wait, so nobody waits forever.
// When no person is found within 15–30 seconds, the player is told so and offered one of the
// House Players (computer opponents at their level); people are always paired first.

export const SEEK_TIME_CONTROLS = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "30+20"]

type Seek = {
  player: Player
  socketId: string
  tc: string
  initial_ms: number
  increment_ms: number
  rating: number
  since: number
  // When to offer a House Player, and the offer on the table.
  houseAt: number
  offer: { house_id: string; expires: number } | null
}

// How long an offer stays open (the page starts the game by itself after a short countdown).
const OFFER_MS = 15_000

const seeks = new Map<string, Seek>() // by player id
let matching = false

// House Players currently in a game or offered to someone.
const busyHouse = (manager: GameManager) => {
  const busy = new Set<string>()
  for (const g of manager.liveGames()) for (const p of [g.r.white, g.r.black]) if (p && isHouse(p.id)) busy.add(p.id)
  for (const s of seeks.values()) if (s.offer) busy.add(s.offer.house_id)
  return busy
}

const offerHouse = async (io: Server, manager: GameManager, id: string, s: Seek, now: number) => {
  const speed = speedOf(s.initial_ms, s.increment_ms)
  const target = await targetRating(s.player.id, speed, s.rating)
  const houseId = await pickHouse({ forPlayer: s.player.id, speed, target, busy: busyHouse(manager) })
  // Still waiting, and nobody else claimed them meanwhile?
  if (!houseId || seeks.get(id) !== s) return
  const [profile, r] = await Promise.all([getProfile(houseId), getRating(houseId, speed)])
  if (!profile) return
  s.offer = { house_id: houseId, expires: now + OFFER_MS }
  io.to(`player:${id}`).emit("seek:house", {
    opponent: { ...publicProfile(profile), rating: Math.round(r.rating), house: true },
    expires_in: OFFER_MS,
  })
}

const match = async (io: Server, manager: GameManager) => {
  if (matching || seeks.size === 0) return
  matching = true
  try {
    const now = Date.now()
    const byTc = new Map<string, (Seek & { id: string })[]>()
    for (const [id, s] of seeks) byTc.set(s.tc, [...(byTc.get(s.tc) ?? []), { ...s, id }])
    for (const list of byTc.values()) {
      for (const [a, b] of pickPairs(list, now)) {
        seeks.delete(a.id)
        seeks.delete(b.id)
        const [white, black] = crypto.randomInt(2) ? [a, b] : [b, a]
        const g = await manager.createPaired(white.player, black.player, a.initial_ms, a.increment_ms, { mode: "online" })
        io.to(`player:${a.id}`).to(`player:${b.id}`).emit("seek:paired", { game_id: g.r.id })
      }
    }
    // Nobody found in time: offer a House Player (an unanswered offer lapses and comes back later).
    for (const [id, s] of seeks) {
      if (s.offer && s.offer.expires < now) {
        s.offer = null
        s.houseAt = now + 20_000
        io.to(`player:${id}`).emit("seek:house-withdrawn", {})
      }
      if (!s.offer && now >= s.houseAt) {
        s.houseAt = now + 20_000
        await offerHouse(io, manager, id, s, now)
      }
    }
  } catch (e) {
    console.error("matching failed", e)
  } finally {
    matching = false
  }
}

export const startSeeking = (io: Server, manager: GameManager) => {
  setInterval(() => void match(io, manager), 1000).unref()
}

export const seekCounts = () => {
  const counts: Record<string, number> = {}
  for (const s of seeks.values()) counts[s.tc] = (counts[s.tc] ?? 0) + 1
  return counts
}

// Who's waiting right now, for the lobby board: time control, rating and picture only (no
// names), so a visitor can pick a waiting player's time control and be paired with them.
const pictures = new Map<string, { url: string | null; at: number }>()
export const seekList = async () => {
  const out: { tc: string; rating: number; avatar_url: string | null; guest: boolean; since: number }[] = []
  for (const s of [...seeks.values()].slice(0, 60)) {
    let pic = pictures.get(s.player.id)
    if (!pic || Date.now() - pic.at > 10 * 60_000) {
      const p = isGuest(s.player.id) ? null : await getProfile(s.player.id).catch(() => null)
      pic = { url: p ? publicProfile(p).avatar_url : null, at: Date.now() }
      pictures.set(s.player.id, pic)
    }
    out.push({ tc: s.tc, rating: Math.round(s.rating), avatar_url: pic.url, guest: isGuest(s.player.id), since: s.since })
  }
  return out
}

type Ack = (res: Record<string, unknown>) => void

export const registerSeek = (io: Server, socket: Socket, manager: GameManager, me: () => Player | null, limited: (s: Socket) => boolean) => {
  socket.on("seek:join", async (input: { tc?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket)) return
    const reply = ack as Ack
    const player = me()
    if (!player) return reply({ ok: false, error: "sign-in" })
    const tc = String(input?.tc ?? "")
    const parsed = SEEK_TIME_CONTROLS.includes(tc) ? parseTimeControl(tc) : null
    if (!parsed) return reply({ ok: false, error: "bad-time-control" })
    if (await banOf(player.id)) return reply({ ok: false, error: "fair-play-ban" })
    const live = manager.liveFor(player.id)
    if (live.length) return reply({ ok: false, error: "in-game", game_id: live[0] })
    const r = await getRating(player.id, speedOf(parsed.initial_ms, parsed.increment_ms))
    const since = Date.now()
    seeks.set(player.id, { player, socketId: socket.id, tc, ...parsed, rating: r.rating, since, houseAt: since + houseWaitMs(), offer: null })
    reply({ ok: true, rating: Math.round(r.rating), provisional: r.rd > PROVISIONAL_RD, guest: isGuest(player.id), waiting: seekCounts()[tc] ?? 1 })
    void match(io, manager)
  })

  // The player takes the House Player they were offered.
  socket.on("seek:house-accept", async (_: unknown, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket)) return
    const reply = ack as Ack
    const player = me()
    const s = player ? seeks.get(player.id) : null
    if (!player || !s || s.socketId !== socket.id || !s.offer || s.offer.expires < Date.now() - 2000) return reply({ ok: false, error: "no-offer" })
    const houseId = s.offer.house_id
    if (manager.liveFor(houseId).length || manager.liveFor(player.id).length) {
      s.offer = null
      s.houseAt = Date.now()
      return reply({ ok: false, error: "gone" })
    }
    seeks.delete(player.id)
    try {
      const profile = await getProfile(houseId)
      const house = { id: houseId, name: profile?.display_name ?? "Player" }
      const [white, black] = crypto.randomInt(2) ? [player, house] : [house, player]
      const g = await manager.createPaired(white, black, s.initial_ms, s.increment_ms, { mode: "online" })
      reply({ ok: true, game_id: g.r.id })
      io.to(`player:${player.id}`).emit("seek:paired", { game_id: g.r.id })
    } catch (e) {
      // Always answer, so the page never waits forever; the player goes back to the pool.
      console.error("house game failed to start", e)
      seeks.set(player.id, { ...s, offer: null, houseAt: Date.now() + 3000 })
      reply({ ok: false, error: "failed" })
    }
  })

  // "Keep waiting for a person": no offer for another minute.
  socket.on("seek:house-later", (_: unknown, ack: unknown) => {
    const player = me()
    const s = player ? seeks.get(player.id) : null
    if (s && s.socketId === socket.id) {
      s.offer = null
      s.houseAt = Date.now() + 60_000
    }
    if (typeof ack === "function") (ack as Ack)({ ok: true })
  })

  socket.on("seek:leave", (_: unknown, ack: unknown) => {
    const player = me()
    if (player && seeks.get(player.id)?.socketId === socket.id) seeks.delete(player.id)
    if (typeof ack === "function") (ack as Ack)({ ok: true })
  })

  socket.on("disconnect", () => {
    const player = me()
    if (player && seeks.get(player.id)?.socketId === socket.id) seeks.delete(player.id)
  })
}
