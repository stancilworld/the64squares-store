import pg from "pg"
import { config } from "./config.js"
import type { GameRecord } from "./game.js"

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 })

// The game server keeps its own tables in the "play" schema of the store's database.
export const migrate = async () => {
  await pool.query(`
    create schema if not exists play;
    create table if not exists play.game (
      id text primary key,
      mode text not null,
      tournament_id text,
      white_id text, white_name text,
      black_id text, black_name text,
      creator_id text not null,
      initial_ms integer not null,
      increment_ms integer not null,
      status text not null,
      result text,
      reason text,
      moves text[] not null default '{}',
      white_ms integer not null,
      black_ms integer not null,
      turn_started_at timestamptz,
      draw_offer text,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      ended_at timestamptz,
      pgn text
    );
    create index if not exists game_status_idx on play.game (status);
    create index if not exists game_white_idx on play.game (white_id);
    create index if not exists game_black_idx on play.game (black_id);
    create index if not exists game_tournament_idx on play.game (tournament_id);
  `)
}

const ts = (n: number | null) => (n == null ? null : new Date(n))
const num = (d: Date | null) => (d ? d.getTime() : null)

export const saveGame = async (g: GameRecord, pgn: string | null) => {
  await pool.query(
    `insert into play.game (id, mode, tournament_id, white_id, white_name, black_id, black_name, creator_id,
       initial_ms, increment_ms, status, result, reason, moves, white_ms, black_ms, turn_started_at, draw_offer,
       created_at, started_at, ended_at, pgn)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     on conflict (id) do update set
       white_id = excluded.white_id, white_name = excluded.white_name,
       black_id = excluded.black_id, black_name = excluded.black_name,
       status = excluded.status, result = excluded.result, reason = excluded.reason, moves = excluded.moves,
       white_ms = excluded.white_ms, black_ms = excluded.black_ms, turn_started_at = excluded.turn_started_at,
       draw_offer = excluded.draw_offer, started_at = excluded.started_at, ended_at = excluded.ended_at,
       pgn = coalesce(excluded.pgn, play.game.pgn)`,
    [
      g.id, g.mode, g.tournament_id, g.white?.id ?? null, g.white?.name ?? null, g.black?.id ?? null, g.black?.name ?? null,
      g.creator_id, g.initial_ms, g.increment_ms, g.status, g.result, g.reason, g.moves, g.white_ms, g.black_ms,
      ts(g.turn_started_at), g.draw_offer, ts(g.created_at), ts(g.started_at), ts(g.ended_at), pgn,
    ]
  )
}

type Row = Record<string, any>

export const recordFromRow = (r: Row): GameRecord => ({
  id: r.id,
  mode: r.mode,
  tournament_id: r.tournament_id,
  white: r.white_id ? { id: r.white_id, name: r.white_name } : null,
  black: r.black_id ? { id: r.black_id, name: r.black_name } : null,
  creator_id: r.creator_id,
  initial_ms: r.initial_ms,
  increment_ms: r.increment_ms,
  status: r.status,
  result: r.result,
  reason: r.reason,
  moves: r.moves ?? [],
  white_ms: r.white_ms,
  black_ms: r.black_ms,
  turn_started_at: num(r.turn_started_at),
  draw_offer: r.draw_offer,
  created_at: num(r.created_at)!,
  started_at: num(r.started_at),
  ended_at: num(r.ended_at),
})

export const loadGame = async (id: string) => {
  const { rows } = await pool.query("select * from play.game where id = $1", [id])
  return rows[0] ? recordFromRow(rows[0]) : null
}

export const loadLiveGames = async () => {
  const { rows } = await pool.query("select * from play.game where status in ('waiting', 'active')")
  return rows.map(recordFromRow)
}

export const recentGamesFor = async (playerId: string, limit = 20) => {
  const { rows } = await pool.query(
    `select id, mode, tournament_id, white_id, white_name, black_id, black_name, initial_ms, increment_ms,
            status, result, reason, array_length(moves, 1) as plies, started_at, ended_at
       from play.game
      where (white_id = $1 or black_id = $1) and status in ('finished', 'active')
      order by coalesce(ended_at, started_at, created_at) desc
      limit $2`,
    [playerId, limit]
  )
  return rows
}

export const gamePgn = async (id: string) => {
  const { rows } = await pool.query("select pgn from play.game where id = $1", [id])
  return (rows[0]?.pgn as string | null) ?? null
}
