import pg from "pg"
import { config } from "./config.js"
import { ageRating, DEFAULT_RATING, PROVISIONAL_RD, type Rating, type Speed } from "./glicko.js"
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
    alter table play.game add column if not exists rated boolean not null default false;
    alter table play.game add column if not exists white_rating integer;
    alter table play.game add column if not exists black_rating integer;
    alter table play.game add column if not exists white_diff integer;
    alter table play.game add column if not exists black_diff integer;
    create table if not exists play.rating (
      player_id text not null,
      speed text not null,
      name text not null,
      rating double precision not null,
      rd double precision not null,
      vol double precision not null,
      games integer not null default 0,
      wins integer not null default 0,
      draws integer not null default 0,
      losses integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (player_id, speed)
    );
    create index if not exists rating_board_idx on play.rating (speed, rating desc);
  `)
}

const ts = (n: number | null) => (n == null ? null : new Date(n))
const num = (d: Date | null) => (d ? d.getTime() : null)

export const saveGame = async (g: GameRecord, pgn: string | null) => {
  await pool.query(
    `insert into play.game (id, mode, tournament_id, white_id, white_name, black_id, black_name, creator_id,
       initial_ms, increment_ms, status, result, reason, moves, white_ms, black_ms, turn_started_at, draw_offer,
       created_at, started_at, ended_at, pgn, rated, white_rating, black_rating, white_diff, black_diff)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     on conflict (id) do update set
       white_id = excluded.white_id, white_name = excluded.white_name,
       black_id = excluded.black_id, black_name = excluded.black_name,
       status = excluded.status, result = excluded.result, reason = excluded.reason, moves = excluded.moves,
       white_ms = excluded.white_ms, black_ms = excluded.black_ms, turn_started_at = excluded.turn_started_at,
       draw_offer = excluded.draw_offer, started_at = excluded.started_at, ended_at = excluded.ended_at,
       pgn = coalesce(excluded.pgn, play.game.pgn),
       white_rating = excluded.white_rating, black_rating = excluded.black_rating,
       white_diff = excluded.white_diff, black_diff = excluded.black_diff`,
    [
      g.id, g.mode, g.tournament_id, g.white?.id ?? null, g.white?.name ?? null, g.black?.id ?? null, g.black?.name ?? null,
      g.creator_id, g.initial_ms, g.increment_ms, g.status, g.result, g.reason, g.moves, g.white_ms, g.black_ms,
      ts(g.turn_started_at), g.draw_offer, ts(g.created_at), ts(g.started_at), ts(g.ended_at), pgn,
      g.rated, g.white_rating, g.black_rating, g.white_diff, g.black_diff,
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
  rated: !!r.rated,
  white_rating: r.white_rating ?? null,
  black_rating: r.black_rating ?? null,
  white_diff: r.white_diff ?? null,
  black_diff: r.black_diff ?? null,
})

export const loadGame = async (id: string) => {
  const { rows } = await pool.query("select * from play.game where id = $1", [id])
  return rows[0] ? recordFromRow(rows[0]) : null
}

export const loadLiveGames = async () => {
  const { rows } = await pool.query("select * from play.game where status in ('waiting', 'active')")
  return rows.map(recordFromRow)
}

// A player's finished games, newest first. `before` pages back through older ones.
export const recentGamesFor = async (playerId: string, limit = 20, before?: Date) => {
  const { rows } = await pool.query(
    `select id, mode, tournament_id, white_id, white_name, black_id, black_name, initial_ms, increment_ms,
            status, result, reason, coalesce(array_length(moves, 1), 0) as plies, started_at, ended_at,
            rated, white_rating, black_rating, white_diff, black_diff
       from play.game
      where (white_id = $1 or black_id = $1) and status = 'finished'
        and ($3::timestamptz is null or ended_at < $3)
      order by ended_at desc
      limit $2`,
    [playerId, Math.min(Math.max(limit, 1), 50), before ?? null]
  )
  return rows
}

// The game a player is in right now, if any (to bring them back to it).
export const liveGamesFor = async (playerId: string) => {
  const { rows } = await pool.query(
    `select id, mode, white_name, black_name, initial_ms, increment_ms
       from play.game
      where (white_id = $1 or black_id = $1) and status = 'active'
      order by started_at desc
      limit 5`,
    [playerId]
  )
  return rows
}

export const gamePgn = async (id: string) => {
  const { rows } = await pool.query("select pgn from play.game where id = $1", [id])
  return (rows[0]?.pgn as string | null) ?? null
}

export type StoredRating = Rating & { games: number; wins: number; draws: number; losses: number; updated_at: Date | null }

// A player's rating for a speed, with its deviation grown for the time away.
export const getRating = async (playerId: string, speed: Speed): Promise<StoredRating> => {
  const { rows } = await pool.query("select * from play.rating where player_id = $1 and speed = $2", [playerId, speed])
  const r = rows[0]
  if (!r) return { ...DEFAULT_RATING, games: 0, wins: 0, draws: 0, losses: 0, updated_at: null }
  const idleDays = (Date.now() - new Date(r.updated_at).getTime()) / 86_400_000
  return { ...ageRating({ rating: r.rating, rd: r.rd, vol: r.vol }, idleDays), games: r.games, wins: r.wins, draws: r.draws, losses: r.losses, updated_at: r.updated_at }
}

export const saveRating = async (playerId: string, speed: Speed, name: string, r: Rating, score: number) => {
  await pool.query(
    `insert into play.rating (player_id, speed, name, rating, rd, vol, games, wins, draws, losses, updated_at)
     values ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, now())
     on conflict (player_id, speed) do update set
       name = excluded.name, rating = excluded.rating, rd = excluded.rd, vol = excluded.vol,
       games = play.rating.games + 1, wins = play.rating.wins + excluded.wins,
       draws = play.rating.draws + excluded.draws, losses = play.rating.losses + excluded.losses, updated_at = now()`,
    [playerId, speed, name, r.rating, r.rd, r.vol, score === 1 ? 1 : 0, score === 0.5 ? 1 : 0, score === 0 ? 1 : 0]
  )
}

const publicRating = (r: Record<string, any>) => ({
  player_id: r.player_id as string,
  name: r.name as string,
  speed: r.speed as Speed,
  rating: Math.round(r.rating),
  provisional: r.rd > PROVISIONAL_RD,
  games: r.games as number,
  wins: r.wins as number,
  draws: r.draws as number,
  losses: r.losses as number,
})

export const ratingsFor = async (playerId: string) => {
  const { rows } = await pool.query("select * from play.rating where player_id = $1", [playerId])
  return rows.map(publicRating)
}

// Top players for a speed; established ratings first, then provisional ones.
export const leaderboard = async (speed: Speed, limit = 50) => {
  const { rows } = await pool.query(
    `select * from play.rating where speed = $1 and games > 0
      order by (rd > $3) asc, rating desc limit $2`,
    [speed, limit, PROVISIONAL_RD]
  )
  return rows.map(publicRating)
}

// Wins, draws and losses for a player's profile (games against the computer counted apart).
export const playerStats = async (playerId: string) => {
  const { rows } = await pool.query(
    `select (mode = 'computer') as vs_computer,
            count(*)::int as games,
            count(*) filter (where (white_id = $1 and result = '1-0') or (black_id = $1 and result = '0-1'))::int as wins,
            count(*) filter (where result = '1/2-1/2')::int as draws
       from play.game where (white_id = $1 or black_id = $1) and status = 'finished'
      group by 1`,
    [playerId]
  )
  const pick = (c: boolean) => {
    const r = rows.find((x) => x.vs_computer === c) ?? { games: 0, wins: 0, draws: 0 }
    return { games: r.games, wins: r.wins, draws: r.draws, losses: r.games - r.wins - r.draws }
  }
  return { people: pick(false), computer: pick(true) }
}
