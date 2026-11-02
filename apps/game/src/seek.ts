import crypto from "node:crypto"
import type { Server, Socket } from "socket.io"
import { getRating } from "./db.js"
import { parseTimeControl, type Player } from "./game.js"
import { PROVISIONAL_RD, speedOf } from "./glicko.js"
import type { GameManager } from "./manager.js"
import { pickPairs } from "./seek-rules.js"

// "Play online": players wait in a pool per time control and are paired with someone close
// in rating. The allowed gap widens the longer they wait, so nobody waits forever.

export const SEEK_TIME_CONTROLS = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "30+20"]

type Seek = {
  player: Player
  socketId: string
  tc: string
  initial_ms: number
  increment_ms: number
  rating: number
  since: number
}

const seeks = new Map<string, Seek>() // by player id
let matching = false

const match = async (io: Server, manager: GameManager) => {
  if (matching || seeks.size < 2) return
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
    const live = manager.liveFor(player.id)
    if (live.length) return reply({ ok: false, error: "in-game", game_id: live[0] })
    const r = await getRating(player.id, speedOf(parsed.initial_ms, parsed.increment_ms))
    seeks.set(player.id, { player, socketId: socket.id, tc, ...parsed, rating: r.rating, since: Date.now() })
    reply({ ok: true, rating: Math.round(r.rating), provisional: r.rd > PROVISIONAL_RD, waiting: seekCounts()[tc] ?? 1 })
    void match(io, manager)
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
