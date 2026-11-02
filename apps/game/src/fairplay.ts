import { Chess } from "chess.js"
import type { Server, Socket } from "socket.io"
import { pool } from "./db.js"
import { Engine } from "./engine.js"
import { analysePlayer, gameRisk, type PositionEval, shouldFlag } from "./fairplay-rules.js"
import { type Color, type Game, isGuest, type Player } from "./game.js"
import type { GameManager } from "./manager.js"

// Fair play: after each rated game the moves are checked with a chess engine; together with
// move timing and how often a player left the game during their own turn, suspicious players
// are put on a list for a person to review in the admin (Play → Fair play). Nobody is ever
// banned automatically.

export const migrateFairPlay = async () => {
  await pool.query(`
    create table if not exists play.fairplay_game (
      game_id text not null,
      player_id text not null,
      colour text not null,
      rating integer,
      analysed integer not null,
      accuracy real not null,
      match_pct integer not null,
      acpl integer not null,
      time_cv real,
      focus_losses integer not null default 0,
      away_ms integer not null default 0,
      risk integer not null,
      reasons jsonb not null default '[]',
      created_at timestamptz not null default now(),
      primary key (game_id, player_id)
    );
    create index if not exists fairplay_game_player_idx on play.fairplay_game (player_id, created_at desc);
    create table if not exists play.fairplay_flag (
      id serial primary key,
      player_id text not null,
      score integer not null,
      reasons jsonb not null default '[]',
      status text not null default 'open',
      note text,
      reviewed_by text,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists fairplay_flag_status_idx on play.fairplay_flag (status, updated_at desc);
    create table if not exists play.ban (
      player_id text primary key,
      scope text not null,
      reason text,
      by_user text,
      created_at timestamptz not null default now()
    );
    alter table play.game add column if not exists refunded boolean not null default false;
  `)
}

// --- Bans ------------------------------------------------------------------------------

// "rated": can't play rated games or tournaments. "all": can't play with people at all.
export const banOf = async (playerId: string) => {
  if (isGuest(playerId)) return null
  const { rows } = await pool.query("select scope, reason from play.ban where player_id = $1", [playerId])
  return (rows[0] as { scope: "rated" | "all"; reason: string | null } | undefined) ?? null
}

// --- Leaving the game during your own move ------------------------------------------------

const focus = new Map<string, Record<Color, { losses: number; away: number }>>()

const takeFocus = (gameId: string) => {
  const f = focus.get(gameId)
  focus.delete(gameId)
  return f ?? { w: { losses: 0, away: 0 }, b: { losses: 0, away: 0 } }
}

// --- Checking finished games ---------------------------------------------------------------

const queue: string[] = []
let engine: Engine | null = null
let working = false

const evaluateGame = async (sans: string[]) => {
  const chess = new Chess()
  const fens = [chess.fen()]
  const forced = [chess.moves().length <= 1]
  const uci: string[] = []
  for (const san of sans) {
    const m = chess.move(san)
    uci.push(`${m.from}${m.to}${m.promotion ?? ""}`)
    fens.push(chess.fen())
    forced.push(chess.moves().length <= 1)
  }
  engine ??= new Engine()
  const evals: PositionEval[] = []
  for (let i = 0; i < fens.length; i++) {
    const end = new Chess(fens[i])
    if (end.isCheckmate()) evals.push({ cp: -1000, best: null, forced: true })
    else if (end.isGameOver()) evals.push({ cp: 0, best: null, forced: true })
    else {
      const e = await engine.evaluate(fens[i])
      evals.push({ ...e, forced: forced[i] })
    }
  }
  return { evals, uci }
}

const checkGame = async (gameId: string) => {
  const { rows } = await pool.query("select * from play.game where id = $1", [gameId])
  const g = rows[0]
  if (!g || !g.rated || g.status !== "finished" || (g.moves?.length ?? 0) < 24) return
  const { evals, uci } = await evaluateGame(g.moves)
  const f = takeFocus(gameId)
  for (const colour of ["w", "b"] as const) {
    const playerId: string | null = colour === "w" ? g.white_id : g.black_id
    if (!playerId || isGuest(playerId)) continue
    const a = analysePlayer(evals, uci, colour, g.move_ms ?? [])
    const rating = (colour === "w" ? g.white_rating : g.black_rating) ?? 1500
    const { risk, reasons } = gameRisk({ ...a, rating, focus_losses: f[colour].losses, away_ms: f[colour].away })
    await pool.query(
      `insert into play.fairplay_game (game_id, player_id, colour, rating, analysed, accuracy, match_pct, acpl, time_cv, focus_losses, away_ms, risk, reasons)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict do nothing`,
      [gameId, playerId, colour, rating, a.analysed, a.accuracy, a.match_pct, a.acpl, a.time_cv, f[colour].losses, Math.round(f[colour].away), risk, JSON.stringify(reasons)]
    )
    await reviewPlayer(playerId)
  }
}

// Opens (or updates) a flag when a player's recent games look suspicious.
const reviewPlayer = async (playerId: string) => {
  const { rows } = await pool.query("select risk, reasons, game_id from play.fairplay_game where player_id = $1 order by created_at desc limit 10", [playerId])
  const risks = rows.map((r) => r.risk as number)
  if (!shouldFlag(risks)) return
  const score = Math.round(Math.max(...risks) * 0.6 + (risks.reduce((a, b) => a + b, 0) / risks.length) * 0.4)
  const reasons = [...new Set(rows.filter((r) => r.risk >= 40).flatMap((r) => r.reasons as string[]))].slice(0, 8)
  const open = await pool.query("select id from play.fairplay_flag where player_id = $1 and status = 'open'", [playerId])
  if (open.rows[0]) {
    await pool.query("update play.fairplay_flag set score = $2, reasons = $3, updated_at = now() where id = $1", [open.rows[0].id, score, JSON.stringify(reasons)])
  } else {
    // Someone already cleared stays cleared unless things get clearly worse.
    const last = await pool.query("select score from play.fairplay_flag where player_id = $1 and status = 'cleared' order by reviewed_at desc limit 1", [playerId])
    if (last.rows[0] && score < last.rows[0].score + 15) return
    await pool.query("insert into play.fairplay_flag (player_id, score, reasons) values ($1, $2, $3)", [playerId, score, JSON.stringify(reasons)])
  }
}

const work = async () => {
  if (working) return
  working = true
  try {
    while (queue.length) {
      const id = queue.shift()!
      try {
        await checkGame(id)
      } catch (e) {
        console.error("fair-play check failed for", id, e)
        engine?.stop()
        engine = null
      }
    }
  } finally {
    working = false
    // Free the engine's memory when there's nothing to do.
    setTimeout(() => {
      if (!queue.length && !working && engine) {
        engine.stop()
        engine = null
      }
    }, 60_000).unref()
  }
}

export const startFairPlay = (manager: GameManager) => {
  manager.whenGameEnds((g: Game) => {
    if (g.r.status === "finished" && g.r.rated && g.r.moves.length >= 24) {
      queue.push(g.r.id)
      void work()
    } else focus.delete(g.r.id)
  })
}

// --- Live events ---------------------------------------------------------------------------

export const registerFairPlay = (_io: Server, socket: Socket, manager: GameManager, me: () => Player | null) => {
  // The page tells us when a player came back after leaving the game tab during their move.
  socket.on("game:focus", async (input: { id?: unknown; away_ms?: unknown }) => {
    const p = me()
    if (!p || typeof input?.id !== "string" || typeof input.away_ms !== "number") return
    const g = await manager.get(input.id)
    if (!g || g.r.status !== "active" || !g.r.rated) return
    // The page only reports this during the player's own move.
    const c = g.colorOf(p.id)
    if (!c) return
    const f = focus.get(g.r.id) ?? { w: { losses: 0, away: 0 }, b: { losses: 0, away: 0 } }
    f[c].losses++
    f[c].away += Math.max(0, Math.min(input.away_ms, 600_000))
    focus.set(g.r.id, f)
  })

  // Tell a warned or banned player once, when they connect.
  const p = me()
  if (p && !isGuest(p.id)) {
    void (async () => {
      const ban = await banOf(p.id)
      if (ban) return socket.emit("fairplay:notice", { status: "banned", scope: ban.scope })
      const { rows } = await pool.query(
        "select id from play.fairplay_flag where player_id = $1 and status = 'warned' and reviewed_at > now() - interval '30 days' limit 1",
        [p.id]
      )
      if (rows[0]) socket.emit("fairplay:notice", { status: "warned" })
    })().catch(() => {})
  }
}
