import { announce, lobbyDefaults } from "./lobby.js"
import { banOf } from "./fairplay.js"
import type { Server, Socket } from "socket.io"
import { applyResult, CHALLENGE_MS, emptyStanding, MAX_GAMES_SAME_PAIR, pairPool, rankQualified, type Standing } from "./arena-rules.js"
import { pool } from "./db.js"
import { type Game, parseTimeControl, type Player } from "./game.js"
import type { GameManager } from "./manager.js"

// Arena tournaments: registered players join during the event and are paired again and
// again until time is up. Tournaments and registrations live in the store's tables
// (read only here); scores live in play.arena_player.

type Tournament = {
  id: string
  title: string
  handle: string
  format: string
  mode: string
  status: string
  time_control: string
  starts_at: number
  ends_at: number
  // Staff paused it from the admin: no new games start (games being played carry on).
  paused: boolean
  // "auto": paired as games end; "challenge": players challenge each other in the lobby.
  pairing: "auto" | "challenge"
  // Games needed to be ranked at the end.
  min_games: number
}

type Arena = {
  t: Tournament
  initial_ms: number
  increment_ms: number
  standings: Map<string, Standing>
  waiting: Set<string>
  playing: Map<string, string> // player id -> game id
  paused: Set<string>
  loadedAt: number
  // One pairing run at a time, so nobody is put in two games.
  pairing: boolean
  // Challenges waiting for an answer: challenger -> { to, until }.
  challenges: Map<string, { to: string; until: number }>
  // Games each pair has played here ("a|b", sorted), to cap rematches in challenge arenas.
  pairs: Map<string, number>
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const DEFAULT_LENGTH_MS = 60 * 60 * 1000
const arenas = new Map<string, Arena>()
// Connections per player, so a player who closed the page isn't paired.
export const online = new Map<string, number>()

export const migrateArena = async () => {
  await pool.query(`
    create table if not exists play.arena_player (
      tournament_id text not null,
      player_id text not null,
      name text not null,
      score integer not null default 0,
      games integer not null default 0,
      wins integer not null default 0,
      draws integer not null default 0,
      losses integer not null default 0,
      streak integer not null default 0,
      sheet integer[] not null default '{}',
      whites integer not null default 0,
      blacks integer not null default 0,
      last_opponent text,
      joined_at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
  `)
}

const loadTournament = async (idOrHandle: string): Promise<Tournament | null> => {
  const { rows } = await pool.query(
    `select *
       from public.tournament
      where (id = $1 or handle = $1) and deleted_at is null and status <> 'draft'`,
    [idOrHandle]
  )
  const r = rows[0]
  if (!r) return null
  const starts = new Date(r.starts_at).getTime()
  return {
    id: r.id,
    title: r.title,
    handle: r.handle,
    format: r.format,
    mode: r.mode,
    status: r.status,
    time_control: r.time_control,
    starts_at: starts,
    ends_at: r.ends_at ? new Date(r.ends_at).getTime() : starts + DEFAULT_LENGTH_MS,
    paused: !!r.paused,
    pairing: r.arena_pairing === "challenge" ? "challenge" : "auto",
    min_games: Number(r.min_games ?? 2),
  }
}

const isRegistered = async (tournamentId: string, playerId: string) => {
  const { rows } = await pool.query(
    `select player_name from public.tournament_registration
      where tournament_id = $1 and customer_id = $2 and status = 'confirmed' and deleted_at is null`,
    [tournamentId, playerId]
  )
  return (rows[0]?.player_name as string | undefined) ?? null
}

const saveStanding = async (tid: string, s: Standing) => {
  await pool.query(
    `insert into play.arena_player (tournament_id, player_id, name, score, games, wins, draws, losses, streak, sheet,
       whites, blacks, last_opponent, joined_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (tournament_id, player_id) do update set
       name = excluded.name, score = excluded.score, games = excluded.games, wins = excluded.wins,
       draws = excluded.draws, losses = excluded.losses, streak = excluded.streak, sheet = excluded.sheet,
       whites = excluded.whites, blacks = excluded.blacks, last_opponent = excluded.last_opponent`,
    [tid, s.player_id, s.name, s.score, s.games, s.wins, s.draws, s.losses, s.streak, s.sheet, s.whites, s.blacks, s.last_opponent, new Date(s.joined_at)]
  )
}

const loadStandings = async (tid: string) => {
  const { rows } = await pool.query("select * from play.arena_player where tournament_id = $1", [tid])
  return new Map<string, Standing>(
    rows.map((r) => [
      r.player_id,
      {
        player_id: r.player_id,
        name: r.name,
        score: r.score,
        games: r.games,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        streak: r.streak,
        sheet: r.sheet ?? [],
        whites: r.whites,
        blacks: r.blacks,
        last_opponent: r.last_opponent,
        joined_at: new Date(r.joined_at).getTime(),
      },
    ])
  )
}

// Games already played between each pair (from the tournament's finished games).
const loadPairs = async (tid: string) => {
  const { rows } = await pool.query(
    "select white_id, black_id, count(*)::int as n from play.game where tournament_id = $1 and mode = 'arena' and status = 'finished' group by 1, 2",
    [tid]
  )
  const m = new Map<string, number>()
  for (const r of rows) m.set(pairKey(r.white_id, r.black_id), (m.get(pairKey(r.white_id, r.black_id)) ?? 0) + r.n)
  return m
}

const getArena = async (idOrHandle: string): Promise<Arena | null> => {
  const cached = [...arenas.values()].find((a) => a.t.id === idOrHandle || a.t.handle === idOrHandle)
  // Re-read the tournament every minute in case the admin changed its times.
  if (cached && Date.now() - cached.loadedAt < 60_000) return cached
  const t = await loadTournament(idOrHandle)
  if (!t || t.format !== "arena" || t.mode !== "online") return null
  const tc = parseTimeControl(t.time_control) ?? { initial_ms: 180_000, increment_ms: 2_000 }
  if (cached) {
    Object.assign(cached, { t, ...tc, loadedAt: Date.now() })
    return cached
  }
  const a: Arena = {
    t,
    ...tc,
    standings: await loadStandings(t.id),
    waiting: new Set(),
    playing: new Map(),
    paused: new Set(),
    loadedAt: Date.now(),
    pairing: false,
    challenges: new Map(),
    pairs: await loadPairs(t.id),
  }
  arenas.set(t.id, a)
  return a
}

const phase = (a: Arena, now = Date.now()) =>
  a.t.status === "cancelled" ? "cancelled" : now < a.t.starts_at ? "before" : now < a.t.ends_at ? "live" : "over"

const view = (a: Arena, now = Date.now()) => ({
  id: a.t.id,
  title: a.t.title,
  handle: a.t.handle,
  time_control: a.t.time_control,
  starts_at: a.t.starts_at,
  ends_at: a.t.ends_at,
  phase: phase(a, now),
  paused: a.t.paused,
  server_now: now,
  pairing: a.t.pairing,
  min_games: a.t.min_games,
  standings: rankQualified([...a.standings.values()], a.t.min_games)
    .slice(0, 100)
    .map(({ s, rank }) => ({
      rank,
      player_id: s.player_id,
      name: s.name,
      score: s.score,
      games: s.games,
      sheet: s.sheet.slice(-12),
      on_fire: s.streak >= 2,
      status: a.playing.has(s.player_id) ? "playing" : a.waiting.has(s.player_id) ? "waiting" : "away",
    })),
  playing_now: a.playing.size / 2,
})

const you = (a: Arena, playerId: string | null) =>
  playerId
    ? {
        joined: a.waiting.has(playerId) || a.playing.has(playerId),
        waiting: a.waiting.has(playerId),
        game_id: a.playing.get(playerId) ?? null,
        paused: a.paused.has(playerId),
      }
    : null

export const registerArena = (
  io: Server,
  socket: Socket,
  manager: GameManager,
  me: () => Player | null,
  limited: (s: Socket, ack?: unknown) => boolean
) => {
  const player = me()
  if (player) {
    socket.join(`player:${player.id}`)
    online.set(player.id, (online.get(player.id) ?? 0) + 1)
    socket.on("disconnect", () => {
      const n = (online.get(player.id) ?? 1) - 1
      if (n > 0) online.set(player.id, n)
      else {
        online.delete(player.id)
        // Left the page: stop pairing them (a game in progress carries on).
        for (const a of arenas.values()) {
          if (a.waiting.delete(player.id)) broadcast(io, a)
        }
      }
    })
  }

  socket.on("arena:watch", async (idOrHandle: unknown, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket, ack) || typeof idOrHandle !== "string" || idOrHandle.length > 120) return
    const a = await getArena(idOrHandle)
    if (!a) return ack({ ok: false, error: "not-found" })
    socket.join(`arena:${a.t.id}`)
    const p = me()
    ack({ ok: true, arena: view(a), you: you(a, p?.id ?? null), registered: p ? !!(await isRegistered(a.t.id, p.id)) : false })
  })

  socket.on("arena:join", async (tid: unknown, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket, ack) || typeof tid !== "string") return
    const p = me()
    if (!p) return ack({ ok: false, error: "sign-in" })
    const a = await getArena(tid)
    if (!a) return ack({ ok: false, error: "not-found" })
    if (phase(a) !== "live") return ack({ ok: false, error: phase(a) === "before" ? "not-started" : "over" })
    const name = await isRegistered(a.t.id, p.id)
    if (!name) return ack({ ok: false, error: "not-registered" })
    if (await banOf(p.id)) return ack({ ok: false, error: "fair-play-ban" })
    if (!a.standings.has(p.id)) {
      const s = emptyStanding(p.id, name, Date.now())
      a.standings.set(p.id, s)
      await saveStanding(a.t.id, s)
    }
    a.paused.delete(p.id)
    if (!a.playing.has(p.id)) a.waiting.add(p.id)
    broadcast(io, a)
    ack({ ok: true, you: you(a, p.id) })
    void pairArena(io, manager, a)
  })

  // Challenge arenas: a player in the arena (not playing) challenges another; they accept or
  // decline within CHALLENGE_MS. At most MAX_GAMES_SAME_PAIR games between the same two.
  socket.on("arena:challenge", async (input: { tid?: unknown; to?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket, ack)) return
    const p = me()
    if (!p) return ack({ ok: false, error: "sign-in" })
    if (typeof input?.tid !== "string" || typeof input.to !== "string" || input.to === p.id) return ack({ ok: false, error: "bad-request" })
    const a = await getArena(input.tid)
    if (!a || a.t.pairing !== "challenge") return ack({ ok: false, error: "not-challenge" })
    if (phase(a) !== "live" || a.t.paused) return ack({ ok: false, error: phase(a) === "before" ? "not-started" : "over" })
    const free = (id: string) => a.waiting.has(id) && !a.playing.has(id) && online.has(id)
    if (!free(p.id)) return ack({ ok: false, error: "join-first" })
    if (!free(input.to)) return ack({ ok: false, error: "busy" })
    if ((a.pairs.get(pairKey(p.id, input.to)) ?? 0) >= MAX_GAMES_SAME_PAIR) return ack({ ok: false, error: "played-enough" })
    const until = Date.now() + CHALLENGE_MS
    a.challenges.set(p.id, { to: input.to, until })
    const from = a.standings.get(p.id)
    io.to(`player:${input.to}`).emit("arena:challenged", { tournament_id: a.t.id, from: { id: p.id, name: from?.name ?? p.name, score: from?.score ?? 0, games: from?.games ?? 0 }, until })
    ack({ ok: true, until })
  })

  socket.on("arena:answer", async (input: { tid?: unknown; from?: unknown; accept?: unknown }, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket, ack)) return
    const p = me()
    if (!p || typeof input?.tid !== "string" || typeof input.from !== "string") return ack({ ok: false, error: "bad-request" })
    const a = await getArena(input.tid)
    if (!a) return ack({ ok: false, error: "not-found" })
    const c = a.challenges.get(input.from)
    if (!c || c.to !== p.id || c.until < Date.now()) return ack({ ok: false, error: "expired" })
    a.challenges.delete(input.from)
    if (input.accept !== true) {
      io.to(`player:${input.from}`).emit("arena:challenge-answer", { tournament_id: a.t.id, by: p.name, accepted: false })
      return ack({ ok: true })
    }
    const free = (id: string) => a.waiting.has(id) && !a.playing.has(id) && online.has(id)
    if (!free(p.id) || !free(input.from) || phase(a) !== "live" || a.t.paused) return ack({ ok: false, error: "busy" })
    if (a.pairing) return ack({ ok: false, error: "busy" })
    a.pairing = true
    try {
      const x = a.standings.get(input.from)!
      const y = a.standings.get(p.id)!
      // Colours to whoever has had fewer Whites.
      const [white, black] = (x?.whites ?? 0) <= (y?.whites ?? 0) ? [x, y] : [y, x]
      a.waiting.delete(white.player_id)
      a.waiting.delete(black.player_id)
      // Their other challenges are off.
      for (const [from, ch] of a.challenges) if (from === white.player_id || from === black.player_id || ch.to === white.player_id || ch.to === black.player_id) a.challenges.delete(from)
      const g = await manager.createPaired({ id: white.player_id, name: white.name }, { id: black.player_id, name: black.name }, a.initial_ms, a.increment_ms, {
        mode: "arena",
        tournamentId: a.t.id,
        readyMs: (await lobbyDefaults(a.t.id)).ready_seconds * 1000,
      })
      a.playing.set(white.player_id, g.r.id)
      a.playing.set(black.player_id, g.r.id)
      io.to(`player:${white.player_id}`).to(`player:${black.player_id}`).emit("arena:paired", { tournament_id: a.t.id, game_id: g.r.id })
      broadcast(io, a)
      ack({ ok: true, game_id: g.r.id })
    } finally {
      a.pairing = false
    }
  })

  socket.on("arena:pause", async (tid: unknown, ack: unknown) => {
    if (typeof ack !== "function" || limited(socket, ack) || typeof tid !== "string") return
    const p = me()
    const a = p ? await getArena(tid) : null
    if (!p || !a) return ack({ ok: false })
    a.waiting.delete(p.id)
    a.paused.add(p.id)
    broadcast(io, a)
    ack({ ok: true, you: you(a, p.id) })
  })
}

const broadcast = (io: Server, a: Arena) => io.to(`arena:${a.t.id}`).emit("arena:state", view(a))

const pairArena = async (io: Server, manager: GameManager, a: Arena) => {
  if (phase(a) !== "live" || a.pairing || a.t.paused || a.t.pairing === "challenge") return
  a.pairing = true
  try {
    await pairNow(io, manager, a)
  } finally {
    a.pairing = false
  }
}

const pairNow = async (io: Server, manager: GameManager, a: Arena) => {
  const free = [...a.waiting].filter((id) => online.has(id) && !a.playing.has(id)).map((id) => a.standings.get(id)!).filter(Boolean)
  for (const { white, black } of pairPool(free)) {
    a.waiting.delete(white.player_id)
    a.waiting.delete(black.player_id)
    const g = await manager.createPaired(
      { id: white.player_id, name: white.name },
      { id: black.player_id, name: black.name },
      a.initial_ms,
      a.increment_ms,
      { mode: "arena", tournamentId: a.t.id, readyMs: (await lobbyDefaults(a.t.id)).ready_seconds * 1000 }
    )
    a.playing.set(white.player_id, g.r.id)
    a.playing.set(black.player_id, g.r.id)
    io.to(`player:${white.player_id}`).to(`player:${black.player_id}`).emit("arena:paired", { tournament_id: a.t.id, game_id: g.r.id })
  }
  broadcast(io, a)
}

// Scores a finished arena game and puts both players back in the pool.
const onArenaGameEnd = (io: Server, manager: GameManager) => async (g: Game) => {
  const tid = g.r.tournament_id
  if (!tid || g.r.mode !== "arena" || !g.r.white || !g.r.black) return
  const a = arenas.get(tid) ?? (await getArena(tid))
  if (!a) return
  const w = g.r.white.id
  const b = g.r.black.id
  a.playing.delete(w)
  a.playing.delete(b)
  const sw = a.standings.get(w)
  const sb = a.standings.get(b)
  if (g.r.status === "finished") a.pairs.set(pairKey(w, b), (a.pairs.get(pairKey(w, b)) ?? 0) + 1)
  if (g.r.status === "finished" && sw && sb) {
    const res = g.r.result
    applyResult(sw, res === "1-0" ? "win" : res === "0-1" ? "loss" : "draw", "w", b)
    applyResult(sb, res === "0-1" ? "win" : res === "1-0" ? "loss" : "draw", "b", w)
    await saveStanding(tid, sw)
    await saveStanding(tid, sb)
  }
  // Whoever missed their first move sits out until they press Join again.
  const noShow = g.r.reason === "no-show" ? (g.r.result === "1-0" ? b : w) : g.r.reason === "no-start" || g.r.reason === "no-shows" ? (g.r.moves.length === 0 ? w : b) : null
  for (const id of [w, b]) {
    if (id === noShow) a.paused.add(id)
    else if (phase(a) === "live" && online.has(id) && !a.paused.has(id)) a.waiting.add(id)
  }
  broadcast(io, a)
  void pairArena(io, manager, a)
}

// Pairs every live arena every few seconds, and announces when one ends.
export const startArenas = async (io: Server, manager: GameManager) => {
  await migrateArena()
  manager.whenGameEnds(onArenaGameEnd(io, manager))
  const lastPhase = new Map<string, string>()
  setInterval(() => {
    for (const a of arenas.values()) {
      // Live arenas re-read their tournament often, so a pause (or new times) from the admin
      // takes effect within seconds.
      if (phase(a) === "live" && Date.now() - a.loadedAt > 5000) {
        a.loadedAt = Date.now()
        void loadTournament(a.t.id).then((t) => {
          if (!t) return
          const changed = t.paused !== a.t.paused || t.ends_at !== a.t.ends_at || t.status !== a.t.status
          a.t = t
          if (changed) broadcast(io, a)
        })
      }
      const p = phase(a)
      const prev = lastPhase.get(a.t.id)
      if (prev !== p) {
        lastPhase.set(a.t.id, p)
        if (p === "over") a.waiting.clear()
        // Not on the first look after a restart (the phase was already this).
        if (prev !== undefined) {
          if (p === "live")
            announce(
              a.t.id,
              a.t.pairing === "challenge"
                ? `The arena is open! Press Join the arena, then challenge anyone available (Challenge on their card). Play at least ${Math.max(1, a.t.min_games)} games to be ranked.`
                : `The arena is open! Press Join the arena: you're paired as soon as a game ends, until the clock runs out.${a.t.min_games > 1 ? ` Play at least ${a.t.min_games} games to be ranked.` : ""}`
            )
          if (p === "over") announce(a.t.id, "Time! The arena is over. Games still going count. Final standings are on the Leaderboard tab.")
        }
        broadcast(io, a)
      }
      if (p === "live" && a.waiting.size >= 2) void pairArena(io, manager, a)
    }
  }, 3000).unref()
}

// Final standings for the tournament page.
export const arenaStandings = async (idOrHandle: string) => {
  const a = await getArena(idOrHandle)
  return a ? view(a) : null
}
