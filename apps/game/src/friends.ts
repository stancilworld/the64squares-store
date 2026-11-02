import type { Server, Socket } from "socket.io"
import { online } from "./arena.js"
import { pool } from "./db.js"
import { isGuest, type Player } from "./game.js"
import type { GameManager } from "./manager.js"
import { getProfile, getProfiles, publicProfile } from "./profiles.js"

// Friends: requests, the friends list (with who's online or playing), and challenging a
// friend directly. Only signed-in players have friends.

export const migrateFriends = async () => {
  await pool.query(`
    create table if not exists play.friendship (
      a text not null,
      b text not null,
      status text not null,
      requested_by text not null,
      created_at timestamptz not null default now(),
      accepted_at timestamptz,
      primary key (a, b)
    );
    create index if not exists friendship_b_idx on play.friendship (b);
  `)
}

const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x])

const relation = async (me: string, other: string) => {
  const [a, b] = pair(me, other)
  const { rows } = await pool.query("select * from play.friendship where a = $1 and b = $2", [a, b])
  const r = rows[0]
  if (!r) return "none" as const
  if (r.status === "accepted") return "friends" as const
  return r.requested_by === me ? ("requested" as const) : ("incoming" as const)
}

const listFor = async (me: string, manager: GameManager) => {
  const { rows } = await pool.query("select * from play.friendship where a = $1 or b = $1", [me])
  const otherOf = (r: { a: string; b: string }) => (r.a === me ? r.b : r.a)
  const profiles = new Map((await getProfiles(rows.map(otherOf))).map((p) => [p.player_id, p]))
  const card = (id: string) => {
    const p = profiles.get(id)
    if (!p) return null
    return { ...publicProfile(p), online: online.has(id), playing: manager.liveFor(id)[0] ?? null }
  }
  const pick = (f: (r: Record<string, string>) => boolean) => rows.filter(f).map((r) => card(otherOf(r))).filter((x) => x != null)
  const friends = pick((r) => r.status === "accepted").sort((x, y) => Number(!!y.playing || y.online) - Number(!!x.playing || x.online) || x.display_name.localeCompare(y.display_name))
  return {
    friends,
    incoming: pick((r) => r.status === "pending" && r.requested_by !== me),
    outgoing: pick((r) => r.status === "pending" && r.requested_by === me),
  }
}

// Challenges sent to a friend and not yet answered: game id → who it's for.
const challenges = new Map<string, { from: string; to: string; timer: NodeJS.Timeout }>()
const CHALLENGE_MS = 60_000

type Ack = (res: Record<string, unknown>) => void

export const registerFriends = (io: Server, socket: Socket, manager: GameManager, me: () => Player | null, limited: (s: Socket) => boolean) => {
  const signedIn = () => {
    const p = me()
    return p && !isGuest(p.id) ? p : null
  }
  const tell = (playerId: string, event: string, data: unknown) => io.to(`player:${playerId}`).emit(event, data)

  socket.on("friends:list", async (_: unknown, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket)) return
    const p = signedIn()
    if (!p) return (ack as Ack)({ ok: false, error: "sign-in" })
    ;(ack as Ack)({ ok: true, ...(await listFor(p.id, manager)) })
  })

  socket.on("friends:relation", async (other: unknown, ack: unknown) => {
    if (typeof ack !== "function" || typeof other !== "string" || limited(socket)) return
    const p = signedIn()
    ;(ack as Ack)({ ok: true, relation: p && p.id !== other ? await relation(p.id, other) : "self" })
  })

  socket.on("friends:request", async (to: unknown, ack: unknown) => {
    if (typeof ack !== "function" || typeof to !== "string" || limited(socket)) return
    const reply = ack as Ack
    const p = signedIn()
    if (!p) return reply({ ok: false, error: "sign-in" })
    const target = await getProfile(to)
    if (!target || target.player_id === p.id) return reply({ ok: false, error: "not-found" })
    const rel = await relation(p.id, target.player_id)
    const [a, b] = pair(p.id, target.player_id)
    if (rel === "incoming") {
      await pool.query("update play.friendship set status = 'accepted', accepted_at = now() where a = $1 and b = $2", [a, b])
      tell(target.player_id, "friends:changed", { type: "accepted", by: p.name })
      return reply({ ok: true, relation: "friends" })
    }
    if (rel === "none") {
      // At most 100 open requests at a time, so nobody can flood others.
      const { rows } = await pool.query("select count(*)::int as n from play.friendship where requested_by = $1 and status = 'pending'", [p.id])
      if (rows[0].n >= 100) return reply({ ok: false, error: "too-many" })
      await pool.query("insert into play.friendship (a, b, status, requested_by) values ($1, $2, 'pending', $3) on conflict do nothing", [a, b, p.id])
      const mine = await getProfile(p.id)
      tell(target.player_id, "friends:changed", { type: "request", from: mine ? publicProfile(mine) : { display_name: p.name } })
    }
    reply({ ok: true, relation: rel === "none" ? "requested" : rel })
  })

  // Accept an incoming request; decline it, cancel your own, or unfriend.
  socket.on("friends:respond", async (input: { id?: unknown; accept?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || typeof input?.id !== "string" || limited(socket)) return
    const p = signedIn()
    if (!p) return (ack as Ack)({ ok: false, error: "sign-in" })
    const [a, b] = pair(p.id, input.id)
    if (input.accept === true) {
      const r = await pool.query(
        "update play.friendship set status = 'accepted', accepted_at = now() where a = $1 and b = $2 and status = 'pending' and requested_by <> $3",
        [a, b, p.id]
      )
      if (r.rowCount) tell(input.id, "friends:changed", { type: "accepted", by: p.name })
    } else {
      await pool.query("delete from play.friendship where a = $1 and b = $2", [a, b])
      tell(input.id, "friends:changed", { type: "removed" })
    }
    ;(ack as Ack)({ ok: true })
  })

  socket.on("challenge:send", async (input: { to?: unknown; tc?: unknown; colour?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || typeof input?.to !== "string" || limited(socket)) return
    const reply = ack as Ack
    const p = signedIn()
    if (!p) return reply({ ok: false, error: "sign-in" })
    if ((await relation(p.id, input.to)) !== "friends") return reply({ ok: false, error: "not-friends" })
    if (!online.has(input.to)) return reply({ ok: false, error: "offline" })
    if (manager.liveFor(input.to).length) return reply({ ok: false, error: "busy" })
    const colour = input.colour === "w" || input.colour === "b" ? input.colour : "random"
    let g
    try {
      g = await manager.createChallenge(p, String(input.tc ?? ""), colour)
    } catch {
      return reply({ ok: false, error: "bad-time-control" })
    }
    const id = g.r.id
    const timer = setTimeout(async () => {
      if (!challenges.delete(id)) return
      await manager.act(id, (game, now) => game.abort(p.id, now))
      tell(p.id, "challenge:closed", { game_id: id, reason: "expired" })
      tell(input.to as string, "challenge:closed", { game_id: id, reason: "expired" })
    }, CHALLENGE_MS)
    timer.unref?.()
    challenges.set(id, { from: p.id, to: input.to, timer })
    const mine = await getProfile(p.id)
    tell(input.to, "challenge:incoming", {
      game_id: id,
      from: mine ? publicProfile(mine) : { display_name: p.name },
      initial_ms: g.r.initial_ms,
      increment_ms: g.r.increment_ms,
      expires_in: CHALLENGE_MS,
    })
    reply({ ok: true, game_id: id })
  })

  socket.on("challenge:respond", async (input: { game_id?: unknown; accept?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || typeof input?.game_id !== "string" || limited(socket)) return
    const reply = ack as Ack
    const p = signedIn()
    const c = challenges.get(input.game_id)
    if (!p || !c || (c.to !== p.id && c.from !== p.id)) return reply({ ok: false, error: "not-open" })
    challenges.delete(input.game_id)
    clearTimeout(c.timer)
    if (input.accept === true && c.to === p.id) {
      const res = await manager.accept(input.game_id, p)
      if (!res.ok) return reply(res)
      tell(c.from, "challenge:accepted", { game_id: input.game_id })
      return reply({ ok: true, game_id: input.game_id })
    }
    // Declined by the friend, or cancelled by the sender.
    await manager.act(input.game_id, (game, now) => game.abort(c.from, now))
    tell(c.from, "challenge:closed", { game_id: input.game_id, reason: c.to === p.id ? "declined" : "cancelled" })
    tell(c.to, "challenge:closed", { game_id: input.game_id, reason: c.to === p.id ? "declined" : "cancelled" })
    reply({ ok: true })
  })
}
