import http from "node:http"
import { Server, type Socket } from "socket.io"
import { playerFromToken } from "./auth.js"
import { migratePuzzles, puzzleRoute } from "./puzzles.js"
import { config } from "./config.js"
import { gamePgn, leaderboard, liveGamesFor, migrate, playerStats, pool, ratingsFor, recentGamesFor } from "./db.js"
import { type Color, type Game, isGuest, type Player } from "./game.js"
import { speedOf, type Speed } from "./glicko.js"
import { GameManager } from "./manager.js"
import { arenaStandings, online, registerArena, startArenas } from "./arena.js"
import { banOf, migrateFairPlay, registerFairPlay, startFairPlay } from "./fairplay.js"
import { migrateFriends, registerFriends } from "./friends.js"
import { xpForGame } from "./levels.js"
import { addXp, ensureProfile, getProfile, getProfiles, migrateProfiles, publicProfile, readAvatar, removeAvatar, searchProfiles, setAvatar, updateProfile } from "./profiles.js"
import { registerSeek, SEEK_TIME_CONTROLS, seekCounts, startSeeking } from "./seek.js"

type Ack = (res: Record<string, unknown>) => void

const send = (res: http.ServerResponse, status: number, body: string | Buffer, type = "application/json", origin?: string, cache = "no-store") => {
  const headers: Record<string, string> = { "content-type": type, "cache-control": cache }
  if (origin && config.origins.includes(origin)) {
    headers["access-control-allow-origin"] = origin
    headers["access-control-allow-headers"] = "authorization, content-type"
    headers["access-control-allow-methods"] = "GET, POST, DELETE, OPTIONS"
  }
  res.writeHead(status, headers).end(body)
}

const json = (res: http.ServerResponse, status: number, body: unknown, origin?: string) => send(res, status, JSON.stringify(body), "application/json", origin)

// Reads an uploaded file, refusing anything over `max` bytes.
const readBody = (req: http.IncomingMessage, max: number) =>
  new Promise<Buffer | null>((resolve) => {
    const parts: Buffer[] = []
    let size = 0
    req.on("data", (c: Buffer) => {
      size += c.length
      if (size > max) {
        resolve(null)
        req.destroy()
      } else parts.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(parts)))
    req.on("error", () => resolve(null))
  })

const bearer = (req: http.IncomingMessage) => /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? null

// Everything public about a player: profile, ratings, results, and whether they're online.
const fullProfile = async (idOrUsername: string) => {
  const p = await getProfile(idOrUsername)
  if (!p) return null
  const [ratings, stats] = await Promise.all([ratingsFor(p.player_id), playerStats(p.player_id)])
  const ban = await banOf(p.player_id)
  return { ...publicProfile(p), ratings, stats, online: online.has(p.player_id), fair_play_closed: !!ban }
}

// Plain web endpoints: a health check, a game's PGN, and a player's recent games.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x")
  const path = url.pathname.replace(/^\/game(?=\/)/, "")
  const origin = req.headers.origin
  try {
    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain", origin)
    let a = /^\/avatars\/([A-Za-z0-9_-]+\.webp)$/.exec(path)
    if (a && req.method === "GET") {
      const img = await readAvatar(a[1])
      return img ? send(res, 200, img, "image/webp", origin, "public, max-age=31536000, immutable") : send(res, 404, "Not found", "text/plain", origin)
    }
    if (path === "/profile/avatar" && (req.method === "POST" || req.method === "DELETE")) {
      const player = await playerFromToken(bearer(req))
      if (!player || isGuest(player.id)) return json(res, 401, { error: "sign-in" }, origin)
      await ensureProfile(player)
      if (req.method === "DELETE") {
        await removeAvatar(player.id)
        return json(res, 200, { ok: true }, origin)
      }
      const body = await readBody(req, 6_000_000)
      if (!body?.length) return json(res, 413, { error: "Pictures can be up to 6 MB" }, origin)
      return json(res, 200, await setAvatar(player.id, body), origin)
    }
    a = /^\/profiles\/([A-Za-z0-9_]{3,60})$/.exec(path)
    if (a && req.method === "GET") {
      const p = await fullProfile(a[1])
      return p ? json(res, 200, { profile: p }, origin) : json(res, 404, { error: "not-found" }, origin)
    }
    if (path === "/profiles" && req.method === "GET") {
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter((x) => /^(cus|guest)_[A-Za-z0-9]{6,40}$/.test(x)).slice(0, 50)
      const rows = await getProfiles(ids)
      // For a game's two players, their record against people too (shown in the match intro).
      const records = ids.length <= 2 ? await Promise.all(rows.map((p) => playerStats(p.player_id).then((s) => s.people))) : []
      return json(res, 200, { profiles: rows.map((p, i) => ({ ...publicProfile(p), online: online.has(p.player_id), record: records[i] })) }, origin)
    }
    const puzzles = await puzzleRoute(req.method ?? "GET", path, url.searchParams, path.startsWith("/puzzles") ? await playerFromToken(bearer(req)) : null, async () => {
      const raw = await readBody(req, 10_000)
      try {
        return raw?.length ? (JSON.parse(raw.toString("utf8")) as Record<string, unknown>) : null
      } catch {
        return null
      }
    })
    if (puzzles) return json(res, puzzles.status, puzzles.body, origin)
    if (path === "/health") return send(res, 200, JSON.stringify({ ok: true, live_games: manager.liveCount() }), "application/json", origin)
    let m = /^\/games\/([A-Za-z0-9]{6,20})\.pgn$/.exec(path)
    if (m && req.method === "GET") {
      const pgn = await gamePgn(m[1])
      return pgn ? send(res, 200, pgn, "application/x-chess-pgn; charset=utf-8", origin) : send(res, 404, "Not found", "text/plain", origin)
    }
    m = /^\/arenas\/([a-z0-9_-]{1,120})\/standings$/i.exec(path)
    if (m && req.method === "GET") {
      const a = await arenaStandings(m[1])
      return a ? send(res, 200, JSON.stringify({ arena: a }), "application/json", origin) : send(res, 404, JSON.stringify({ error: "not-found" }), "application/json", origin)
    }
    m = /^\/games\/([A-Za-z0-9]{6,20})\/review$/.exec(path)
    if (m && req.method === "GET") {
      // A finished game's moves for the analysis board (never a game still being played).
      const { rows } = await pool.query(
        `select id, mode, rated, status, result, reason, moves, white_id, white_name, white_rating, black_id, black_name, black_rating,
                initial_ms, increment_ms, coalesce(ended_at, created_at) as played_at
           from play.game where id = $1`,
        [m[1]]
      )
      const g = rows[0]
      if (!g || g.status !== "finished") return json(res, 404, { error: "not-found" }, origin)
      return json(res, 200, { game: g }, origin)
    }
    m = /^\/games\/([A-Za-z0-9]{6,20})\/status$/.exec(path)
    if (m && req.method === "GET") {
      const g = await manager.get(m[1])
      if (!g) return send(res, 404, JSON.stringify({ error: "not-found" }), "application/json", origin)
      const v = g.view(Date.now())
      return send(res, 200, JSON.stringify({ id: v.id, status: v.status, mode: v.mode, white: v.white, black: v.black }), "application/json", origin)
    }
    m = /^\/players\/(cus_[A-Za-z0-9]{6,40})\/games$/.exec(path)
    if (m && req.method === "GET") {
      const before = url.searchParams.get("before")
      const when = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined
      const limit = Number(url.searchParams.get("limit")) || 20
      return send(res, 200, JSON.stringify({ games: await recentGamesFor(m[1], limit, when) }), "application/json", origin)
    }
    m = /^\/players\/(cus_[A-Za-z0-9]{6,40})\/live$/.exec(path)
    if (m && req.method === "GET") {
      return send(res, 200, JSON.stringify({ games: await liveGamesFor(m[1]) }), "application/json", origin)
    }
    m = /^\/players\/(cus_[A-Za-z0-9]{6,40})\/ratings$/.exec(path)
    if (m && req.method === "GET") {
      return send(res, 200, JSON.stringify({ ratings: await ratingsFor(m[1]) }), "application/json", origin)
    }
    if (path === "/leaderboard" && req.method === "GET") {
      const speed = (url.searchParams.get("speed") ?? "blitz") as Speed
      if (!["bullet", "blitz", "rapid", "classical"].includes(speed)) return send(res, 400, JSON.stringify({ error: "bad-speed" }), "application/json", origin)
      return send(res, 200, JSON.stringify({ speed, players: await leaderboard(speed) }), "application/json", origin)
    }
    if (path === "/lobby" && req.method === "GET") {
      return send(res, 200, JSON.stringify({ playing: manager.liveCount(), online: online.size, seeking: seekCounts(), time_controls: SEEK_TIME_CONTROLS }), "application/json", origin)
    }
    send(res, 404, JSON.stringify({ error: "not-found" }), "application/json", origin)
  } catch (e) {
    console.error(e)
    send(res, 500, JSON.stringify({ error: "server-error" }), "application/json", origin)
  }
})

const io = new Server(server, {
  path: "/game/socket.io",
  cors: { origin: config.origins, credentials: false },
  pingInterval: 10_000,
  pingTimeout: 8_000,
  maxHttpBufferSize: 16_000,
})

const room = (id: string) => `game:${id}`
const manager = new GameManager((view) => {
  io.to(room(view.id)).emit("game:state", view)
  if (view.status === "finished" || view.status === "aborted") presence.delete(view.id)
})

// Rematch offers on finished games: game id → the player who offered.
const rematches = new Map<string, string>()

// Who of the two players has the game open. When one leaves and doesn't come back, the
// other may claim the win (or a draw) after a short wait.
// rtt: the player's last measured round trip to the server (ms), for the signal bars.
type Seat = { sockets: Set<string>; goneAt: number | null; rtt: number | null }
const presence = new Map<string, { w: Seat; b: Seat }>()
const claimAfterMs = (g: Game) => (["bullet", "blitz"].includes(speedOf(g.r.initial_ms, g.r.increment_ms)) ? 30_000 : 60_000)

// Connection quality as 1–4 bars from the round-trip time (unknown counts as good).
const signalOf = (rtt: number | null) => (rtt == null ? 4 : rtt < 150 ? 4 : rtt < 300 ? 3 : rtt < 600 ? 2 : 1)

const presenceView = (g: Game, now = Date.now()) => {
  const p = presence.get(g.r.id)
  const seat = (c: Color) => {
    const s = p?.[c]
    const online = !!s && s.sockets.size > 0
    const since = s?.goneAt ?? g.r.started_at ?? now
    return { online, gone_ms: online ? null : Math.max(0, now - since), signal: online ? signalOf(s?.rtt ?? null) : 0 }
  }
  return { id: g.r.id, w: seat("w"), b: seat("b"), claim_after_ms: claimAfterMs(g) }
}

const sendPresence = (g: Game) => {
  if (g.r.status === "active") io.to(room(g.r.id)).emit("game:presence", presenceView(g))
}

const seatFor = (id: string, c: Color) => {
  let p = presence.get(id)
  if (!p) {
    p = { w: { sockets: new Set(), goneAt: null, rtt: null }, b: { sockets: new Set(), goneAt: null, rtt: null } }
    presence.set(id, p)
  }
  return p[c]
}

// Players are known from their play token; anyone may watch.
io.use(async (socket, next) => {
  const player = await playerFromToken(socket.handshake.auth?.token)
  // Signed-in players play under their profile's display name.
  if (player && !isGuest(player.id)) {
    try {
      const profile = await ensureProfile(player)
      if (profile) player.name = profile.display_name
    } catch (e) {
      console.error("profile lookup failed", e)
    }
  }
  socket.data.player = player
  next()
})

// At most 30 events per 5 seconds per connection.
const limited = (socket: Socket) => {
  const now = Date.now()
  const hits: number[] = (socket.data.hits ?? []).filter((t: number) => now - t < 5000)
  hits.push(now)
  socket.data.hits = hits
  return hits.length > 30
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{6,20}$/.test(v)

io.on("connection", (socket) => {
  const me = (): Player | null => socket.data.player ?? null
  const guard = (ack: unknown): ack is Ack => typeof ack === "function"

  socket.on("game:create", async (input: { tc?: unknown; colour?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    if ((await banOf(player.id))?.scope === "all") return ack({ ok: false, error: "fair-play-ban" })
    const colour = input?.colour === "w" || input?.colour === "b" ? (input.colour as Color) : "random"
    try {
      const g = await manager.createChallenge(player, String(input?.tc ?? ""), colour)
      socket.join(room(g.r.id))
      ack({ ok: true, id: g.r.id })
    } catch (e) {
      ack({ ok: false, error: (e as Error).message === "bad-time-control" ? "bad-time-control" : "server-error" })
    }
  })

  socket.on("game:watch", async (id: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(id)) return
    const g = await manager.get(id)
    if (!g) return ack({ ok: false, error: "not-found" })
    socket.join(room(id))
    const player = me()
    const colour = player ? g.colorOf(player.id) : null
    if (colour && g.r.status === "active") {
      const seat = seatFor(id, colour)
      seat.sockets.add(socket.id)
      seat.goneAt = null
      ;(socket.data.seats ??= []).push([id, colour])
      sendPresence(g)
    }
    ack({ ok: true, game: g.view(Date.now()), you: player?.id ?? null, presence: g.r.status === "active" ? presenceView(g) : null })
  })

  // Players ping every few seconds; the answer measures their round trip, which they report
  // with the next ping. Opponents see the result as signal bars.
  socket.on("game:ping", async (input: { id?: unknown; rtt?: unknown }, ack: unknown) => {
    if (!guard(ack)) return
    ack({ ok: true })
    const player = me()
    if (!player || !isId(input?.id) || typeof input.rtt !== "number" || !Number.isFinite(input.rtt)) return
    const g = await manager.get(input.id)
    const colour = g ? g.colorOf(player.id) : null
    const seat = colour ? presence.get(input.id)?.[colour] : null
    if (!g || !seat || g.r.status !== "active") return
    const rtt = Math.max(0, Math.min(input.rtt, 30_000))
    const before = signalOf(seat.rtt)
    // Smooth it a little so one slow answer doesn't flicker the bars.
    seat.rtt = seat.rtt == null ? rtt : Math.round(seat.rtt * 0.5 + rtt * 0.5)
    if (signalOf(seat.rtt) !== before) sendPresence(g)
  })

  socket.on("game:claim", async (input: { id?: unknown; outcome?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(input?.id)) return
    const outcome = input.outcome === "draw" ? "draw" : "win"
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    const g = await manager.get(input.id)
    const colour = g ? g.colorOf(player.id) : null
    if (!g || !colour || g.r.status !== "active") return ack({ ok: false, error: "not-active" })
    const opp = presenceView(g)[colour === "w" ? "b" : "w"]
    if (opp.online || (opp.gone_ms ?? 0) < claimAfterMs(g)) return ack({ ok: false, error: "not-yet" })
    ack(await manager.act(input.id, (game, now) => game.claim(player.id, outcome, now)))
  })

  // Rematch: one side offers, the other accepts; colours swap.
  socket.on("game:rematch", async (input: { id?: unknown; action?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(input?.id)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    const g = await manager.get(input.id)
    if (!g || g.r.status !== "finished" || !g.colorOf(player.id) || (g.r.mode !== "friend" && g.r.mode !== "online")) {
      return ack({ ok: false, error: "not-available" })
    }
    const id = g.r.id
    if (input.action === "decline") {
      rematches.delete(id)
      io.to(room(id)).emit("game:rematch", { id, by: null, declined: true })
      return ack({ ok: true })
    }
    const by = rematches.get(id)
    if (by && by !== player.id) {
      rematches.delete(id)
      if (manager.liveFor(g.r.white!.id).length || manager.liveFor(g.r.black!.id).length) return ack({ ok: false, error: "in-game" })
      const next = await manager.createPaired(g.r.black!, g.r.white!, g.r.initial_ms, g.r.increment_ms, { mode: g.r.mode, rated: g.r.rated })
      io.to(room(id)).emit("game:rematch", { id, game_id: next.r.id })
      return ack({ ok: true, game_id: next.r.id })
    }
    rematches.set(id, player.id)
    io.to(room(id)).emit("game:rematch", { id, by: player.id })
    ack({ ok: true })
  })

  socket.on("computer:save", async (input: { colour?: unknown; level?: unknown; moves?: unknown; resigned?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket)) return
    const player = me()
    if (!player || isGuest(player.id)) return ack({ ok: false, error: "sign-in" })
    const colour = input?.colour === "b" ? "b" : "w"
    const level = Number(input?.level) || 1
    const res = await manager.saveComputerGame(player, colour, level, input?.moves as string[], input?.resigned === true)
    if (res.ok) await addXp(player.id, xpForGame({ result: res.result, mode: "computer", computerLevel: level, plies: res.plies }))
    ack(res)
  })

  socket.on("profile:mine", async (_: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket)) return
    const player = me()
    if (!player || isGuest(player.id)) return ack({ ok: false, error: "sign-in" })
    await ensureProfile(player)
    ack({ ok: true, profile: await fullProfile(player.id) })
  })

  socket.on("profile:update", async (input: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket)) return
    const player = me()
    if (!player || isGuest(player.id)) return ack({ ok: false, error: "sign-in" })
    const res = await updateProfile(player.id, (input ?? {}) as Record<string, unknown>)
    if (res.ok) player.name = res.profile.display_name
    ack(res)
  })

  socket.on("profile:search", async (q: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || typeof q !== "string") return
    const rows = await searchProfiles(q.slice(0, 40))
    ack({ ok: true, profiles: rows.map((p) => ({ ...publicProfile(p), online: online.has(p.player_id) })) })
  })

  socket.on("disconnect", () => {
    for (const [id, colour] of (socket.data.seats ?? []) as [string, Color][]) {
      const seat = presence.get(id)?.[colour]
      if (!seat || !seat.sockets.delete(socket.id) || seat.sockets.size > 0) continue
      seat.goneAt = Date.now()
      void manager.get(id).then((g) => g && sendPresence(g))
    }
  })

  socket.on("game:accept", async (id: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(id)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    if ((await banOf(player.id))?.scope === "all") return ack({ ok: false, error: "fair-play-ban" })
    const res = await manager.accept(id, player)
    socket.join(room(id))
    ack(res.ok ? { ok: true } : res)
  })

  socket.on("game:move", async (input: { id?: unknown; uci?: unknown; ply?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(input?.id) || typeof input.uci !== "string" || typeof input.ply !== "number") return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    ack(await manager.act(input.id, (g, now) => g.move(player.id, input.uci as string, input.ply as number, now)))
  })

  socket.on("game:resign", async (id: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(id)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    ack(await manager.act(id, (g, now) => g.resign(player.id, now)))
  })

  socket.on("game:abort", async (id: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(id)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    ack(await manager.act(id, (g, now) => g.abort(player.id, now)))
  })

  socket.on("game:draw", async (input: { id?: unknown; action?: unknown }, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(input?.id)) return
    const action = input.action
    if (action !== "offer" && action !== "accept" && action !== "decline") return ack({ ok: false, error: "bad-action" })
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
    ack(await manager.act(input.id, (g, now) => g.draw(player.id, action, now)))
  })

  registerArena(io, socket, manager, me, limited)
  registerSeek(io, socket, manager, me, limited)
  registerFriends(io, socket, manager, me, limited)
  registerFairPlay(io, socket, manager, me)
})

const main = async () => {
  await migrate()
  await migrateProfiles()
  await migrateFriends()
  await migrateFairPlay()
  await migratePuzzles()
  startFairPlay(manager)
  // Experience for both players when a game against a person ends.
  manager.whenGameEnds(async (g) => {
    if (g.r.status !== "finished" || !g.r.result) return
    for (const c of ["w", "b"] as const) {
      const p = c === "w" ? g.r.white : g.r.black
      if (!p) continue
      const result = g.r.result === "1/2-1/2" ? "draw" : (g.r.result === "1-0") === (c === "w") ? "win" : "loss"
      await addXp(p.id, xpForGame({ result, mode: g.r.mode, plies: g.r.moves.length }))
    }
  })
  await startArenas(io, manager)
  startSeeking(io, manager)
  const restored = await manager.restore()
  server.listen(config.port, () => {
    console.log(`Game server on :${config.port} (${restored} live games restored)`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    io.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}

export { io, manager }
