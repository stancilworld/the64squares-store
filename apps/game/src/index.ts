import http from "node:http"
import { Server, type Socket } from "socket.io"
import { playerFromToken } from "./auth.js"
import { config } from "./config.js"
import { gamePgn, migrate, recentGamesFor } from "./db.js"
import type { Color, Player } from "./game.js"
import { GameManager } from "./manager.js"
import { arenaStandings, registerArena, startArenas } from "./arena.js"

type Ack = (res: Record<string, unknown>) => void

const send = (res: http.ServerResponse, status: number, body: string, type = "application/json", origin?: string) => {
  const headers: Record<string, string> = { "content-type": type, "cache-control": "no-store" }
  if (origin && config.origins.includes(origin)) headers["access-control-allow-origin"] = origin
  res.writeHead(status, headers).end(body)
}

// Plain web endpoints: a health check, a game's PGN, and a player's recent games.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x")
  const path = url.pathname.replace(/^\/game(?=\/)/, "")
  const origin = req.headers.origin
  try {
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
    m = /^\/players\/(cus_[A-Za-z0-9]{6,40})\/games$/.exec(path)
    if (m && req.method === "GET") {
      return send(res, 200, JSON.stringify({ games: await recentGamesFor(m[1]) }), "application/json", origin)
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
const manager = new GameManager((view) => io.to(room(view.id)).emit("game:state", view))

// Players are known from their play token; anyone may watch.
io.use(async (socket, next) => {
  socket.data.player = await playerFromToken(socket.handshake.auth?.token)
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
    ack({ ok: true, game: g.view(Date.now()), you: me()?.id ?? null })
  })

  socket.on("game:accept", async (id: unknown, ack: unknown) => {
    if (!guard(ack) || limited(socket) || !isId(id)) return
    const player = me()
    if (!player) return ack({ ok: false, error: "sign-in" })
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
})

const main = async () => {
  await migrate()
  await startArenas(io, manager)
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
