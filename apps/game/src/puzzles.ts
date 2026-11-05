import { pool } from "./db.js"
import { DEFAULT_RATING, PROVISIONAL_RD, type Rating, update } from "./glicko.js"
import { isGuest, type Player } from "./game.js"
import { addXp } from "./profiles.js"

// Puzzles: positions from real games where one side has a winning line. The puzzles come
// from the Lichess puzzle database (free to use, CC0), imported by src/import-puzzles.ts.
//
// Format (as Lichess): `fen` is the position before the opponent's last move; moves[0] is
// that move (the website plays it), then the player and the opponent alternate.
// Every puzzle a player meets is rated the first time they try it; Puzzle Rush is not.

export const migratePuzzles = async () => {
  await pool.query(`
    create table if not exists play.puzzle (
      id text primary key,
      fen text not null,
      moves text[] not null,
      rating integer not null,
      popularity integer not null default 0,
      plays integer not null default 0,
      themes text[] not null default '{}'
    );
    create index if not exists puzzle_rating_idx on play.puzzle (rating);
    create index if not exists puzzle_themes_idx on play.puzzle using gin (themes);
    create table if not exists play.puzzle_player (
      player_id text primary key,
      rating real not null default 1500,
      rd real not null default 350,
      vol real not null default 0.06,
      solved integer not null default 0,
      failed integer not null default 0,
      streak integer not null default 0,
      best_streak integer not null default 0,
      rush_best integer not null default 0,
      updated_at timestamptz not null default now()
    );
    create table if not exists play.puzzle_attempt (
      player_id text not null,
      puzzle_id text not null,
      solved boolean not null,
      rating_before integer,
      rating_after integer,
      created_at timestamptz not null default now(),
      primary key (player_id, puzzle_id)
    );
    create index if not exists puzzle_attempt_player_idx on play.puzzle_attempt (player_id, created_at desc);
  `)
}

export type PuzzleRow = { id: string; fen: string; moves: string[]; rating: number; themes: string[]; plays?: number }
const publicPuzzle = (p: PuzzleRow) => ({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, plays: p.plays ?? 0 })

// A puzzle's own rating has a fixed, small deviation.
const PUZZLE_RD = 80

export const THEME_NAMES: Record<string, string> = {
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered attack",
  hangingPiece: "Hanging piece",
  sacrifice: "Sacrifice",
  backRankMate: "Back-rank mate",
  deflection: "Deflection",
  attraction: "Attraction",
  promotion: "Promotion",
  endgame: "Endgame",
  opening: "Opening",
  middlegame: "Middlegame",
  short: "Short puzzles",
  long: "Long puzzles",
  advantage: "Win material",
  defensiveMove: "Defensive move",
  quietMove: "Quiet move",
  zugzwang: "Zugzwang",
}

type Stats = { rating: number; rd: number; vol: number; solved: number; failed: number; streak: number; best_streak: number; rush_best: number }

const statsFor = async (playerId: string | null): Promise<Stats> => {
  const blank = { ...DEFAULT_RATING, solved: 0, failed: 0, streak: 0, best_streak: 0, rush_best: 0 }
  if (!playerId) return blank
  const { rows } = await pool.query("select * from play.puzzle_player where player_id = $1", [playerId])
  return rows[0] ? (rows[0] as Stats) : blank
}

const view = (s: Stats) => ({
  rating: Math.round(s.rating),
  provisional: s.rd > PROVISIONAL_RD,
  solved: s.solved,
  failed: s.failed,
  streak: s.streak,
  best_streak: s.best_streak,
  rush_best: s.rush_best,
})

const today = () => new Date().toISOString().slice(0, 10)
let daily: { date: string; puzzle: PuzzleRow } | null = null

export const dailyPuzzle = async () => {
  const date = today()
  if (daily?.date === date) return daily
  // The same well-liked, medium-difficulty puzzle for everyone today.
  const { rows } = await pool.query(
    `select * from play.puzzle where rating between 1300 and 2000 and popularity >= 85
      order by md5(id || $1) limit 1`,
    [date]
  )
  const fallback = rows[0] ? null : (await pool.query("select * from play.puzzle order by md5(id || $1) limit 1", [date])).rows[0]
  const p = (rows[0] ?? fallback) as PuzzleRow | undefined
  daily = p ? { date, puzzle: p } : null
  return daily
}

let themeCache: { at: number; list: { theme: string; name: string; count: number }[] } | null = null
const themeList = async () => {
  if (themeCache && Date.now() - themeCache.at < 3_600_000) return themeCache.list
  const { rows } = await pool.query("select t as theme, count(*)::int as count from play.puzzle, unnest(themes) t group by t")
  const counts = new Map(rows.map((r) => [r.theme as string, r.count as number]))
  const list = Object.entries(THEME_NAMES)
    .filter(([t]) => (counts.get(t) ?? 0) >= 5)
    .map(([theme, name]) => ({ theme, name, count: counts.get(theme)! }))
  themeCache = { at: Date.now(), list }
  return list
}

// A puzzle near the player's rating that they haven't seen, widening the search if needed.
const nextPuzzle = async (playerId: string | null, rating: number, theme: string | null) => {
  for (const spread of [120, 250, 500, 3000]) {
    const { rows } = await pool.query(
      `select * from play.puzzle p
        where rating between $1 and $2
          and ($3::text is null or $3 = any(themes))
          and ($4::text is null or not exists (select 1 from play.puzzle_attempt a where a.player_id = $4 and a.puzzle_id = p.id))
        order by random() limit 1`,
      [Math.round(rating - spread), Math.round(rating + spread), theme, playerId]
    )
    if (rows[0]) return rows[0] as PuzzleRow
  }
  // Seen them all: any puzzle at all.
  const { rows } = await pool.query("select * from play.puzzle where ($1::text is null or $1 = any(themes)) order by random() limit 1", [theme])
  return (rows[0] as PuzzleRow | undefined) ?? null
}

// Records a first try at a puzzle and moves the player's puzzle rating.
const recordResult = async (player: Player | null, puzzleId: string, solved: boolean) => {
  const { rows } = await pool.query("select * from play.puzzle where id = $1", [puzzleId])
  const puzzle = rows[0] as PuzzleRow | undefined
  if (!puzzle) return { ok: false as const, error: "not-found" }
  await pool.query("update play.puzzle set plays = plays + 1 where id = $1", [puzzleId])
  if (!player) return { ok: true as const, rated: false }
  const before = await statsFor(player.id)
  const seen = await pool.query("select 1 from play.puzzle_attempt where player_id = $1 and puzzle_id = $2", [player.id, puzzleId])
  if (seen.rowCount) return { ok: true as const, rated: false, ...view(before) }
  const me: Rating = { rating: before.rating, rd: before.rd, vol: before.vol }
  const after = update(me, { rating: puzzle.rating, rd: PUZZLE_RD, vol: 0.06 }, solved ? 1 : 0)
  const streak = solved ? before.streak + 1 : 0
  const s: Stats = {
    ...after,
    solved: before.solved + (solved ? 1 : 0),
    failed: before.failed + (solved ? 0 : 1),
    streak,
    best_streak: Math.max(before.best_streak, streak),
    rush_best: before.rush_best,
  }
  await pool.query(
    `insert into play.puzzle_player (player_id, rating, rd, vol, solved, failed, streak, best_streak, rush_best, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (player_id) do update set rating = $2, rd = $3, vol = $4, solved = $5, failed = $6, streak = $7, best_streak = $8, updated_at = now()`,
    [player.id, s.rating, s.rd, s.vol, s.solved, s.failed, s.streak, s.best_streak, s.rush_best]
  )
  await pool.query(
    "insert into play.puzzle_attempt (player_id, puzzle_id, solved, rating_before, rating_after) values ($1,$2,$3,$4,$5) on conflict do nothing",
    [player.id, puzzleId, solved, Math.round(before.rating), Math.round(s.rating)]
  )
  const isDaily = daily?.puzzle.id === puzzleId
  if (solved && !isGuest(player.id)) await addXp(player.id, isDaily ? 10 : 2)
  return { ok: true as const, rated: true, diff: Math.round(s.rating) - Math.round(before.rating), xp: solved ? (isDaily ? 10 : 2) : 0, ...view(s) }
}

// Puzzle Rush: a ladder of puzzles from easy to hard.
const rushSet = async () => {
  const { rows } = await pool.query(
    `select * from (
       select *, row_number() over (partition by (rating / 100) order by random()) as n from play.puzzle
        where rating between 400 and 2800 and cardinality(moves) <= 6
     ) x where n <= 3 order by rating limit 60`
  )
  return (rows as PuzzleRow[]).map(publicPuzzle)
}

const saveRush = async (player: Player, score: number) => {
  const s = Math.max(0, Math.min(200, Math.round(score)))
  const { rows } = await pool.query(
    `insert into play.puzzle_player (player_id, rush_best) values ($1, $2)
     on conflict (player_id) do update set rush_best = greatest(play.puzzle_player.rush_best, $2)
     returning rush_best`,
    [player.id, s]
  )
  if (!isGuest(player.id)) await addXp(player.id, Math.min(30, s))
  return { ok: true, best: rows[0].rush_best as number, xp: Math.min(30, s) }
}

// HTTP routes under /game/puzzles. Returns null when the path isn't a puzzle route.
export const puzzleRoute = async (
  method: string,
  path: string,
  query: URLSearchParams,
  player: Player | null,
  body: () => Promise<Record<string, unknown> | null>
): Promise<{ status: number; body: unknown } | null> => {
  if (!path.startsWith("/puzzles")) return null
  if (method === "GET" && path === "/puzzles/me") {
    const s = await statsFor(player?.id ?? null)
    const d = await dailyPuzzle()
    let dailyDone = false
    if (player && d) dailyDone = !!(await pool.query("select 1 from play.puzzle_attempt where player_id = $1 and puzzle_id = $2", [player.id, d.puzzle.id])).rowCount
    return { status: 200, body: { ...view(s), signed_in: !!player && !isGuest(player.id), daily_done: dailyDone } }
  }
  if (method === "GET" && path === "/puzzles/next") {
    const theme = query.get("theme")
    const t = theme && THEME_NAMES[theme] ? theme : null
    const s = await statsFor(player?.id ?? null)
    const p = await nextPuzzle(player?.id ?? null, s.rating, t)
    return p ? { status: 200, body: { puzzle: publicPuzzle(p) } } : { status: 404, body: { error: "no-puzzles" } }
  }
  if (method === "GET" && path === "/puzzles/daily") {
    const d = await dailyPuzzle()
    return d ? { status: 200, body: { date: d.date, puzzle: publicPuzzle(d.puzzle) } } : { status: 404, body: { error: "no-puzzles" } }
  }
  if (method === "GET" && path === "/puzzles/themes") return { status: 200, body: { themes: await themeList() } }
  if (method === "GET" && path === "/puzzles/rush") return { status: 200, body: { puzzles: await rushSet() } }
  if (method === "POST" && path === "/puzzles/rush") {
    if (!player) return { status: 200, body: { ok: true, best: null } }
    const b = await body()
    return { status: 200, body: await saveRush(player, Number(b?.score) || 0) }
  }
  let m = /^\/puzzles\/([A-Za-z0-9]{3,12})$/.exec(path)
  if (m && method === "GET") {
    const { rows } = await pool.query("select * from play.puzzle where id = $1", [m[1]])
    return rows[0] ? { status: 200, body: { puzzle: publicPuzzle(rows[0]) } } : { status: 404, body: { error: "not-found" } }
  }
  m = /^\/puzzles\/([A-Za-z0-9]{3,12})\/result$/.exec(path)
  if (m && method === "POST") {
    const b = await body()
    const res = await recordResult(player, m[1], b?.solved === true)
    return { status: res.ok ? 200 : 404, body: res }
  }
  return { status: 404, body: { error: "not-found" } }
}
