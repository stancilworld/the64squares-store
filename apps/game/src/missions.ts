import { pool } from "./db.js"
import { isGuest, type Player } from "./game.js"
import { addXp } from "./profiles.js"
import { dailyPuzzle } from "./puzzles.js"
import { type Day, indiaDay, missionsFor } from "./missions-rules.js"

export { indiaDay }

// Daily missions: three small goals a day (Indian time), each worth XP once completed and
// claimed. Progress is worked out from the day's games and puzzles, so nothing else needs
// to report to it.

export const migrateMissions = async () => {
  await pool.query(`
    create table if not exists play.mission_claim (
      player_id text not null,
      day date not null,
      mission_id text not null,
      xp integer not null,
      created_at timestamptz not null default now(),
      primary key (player_id, day, mission_id)
    );
  `)
}

const dayData = async (playerId: string, day: string): Promise<Day> => {
  const [games, puzzles, daily] = await Promise.all([
    pool.query(
      `select mode, result, white_id, black_id, white_name, black_name, initial_ms from play.game
        where (white_id = $1 or black_id = $1) and status = 'finished' and (ended_at at time zone 'Asia/Kolkata')::date = $2::date`,
      [playerId, day]
    ),
    pool.query(
      `select count(*)::int as n from play.puzzle_attempt where player_id = $1 and solved and (created_at at time zone 'Asia/Kolkata')::date = $2::date`,
      [playerId, day]
    ),
    dailyPuzzle(),
  ])
  const dailySolved = daily
    ? !!(await pool.query("select 1 from play.puzzle_attempt where player_id = $1 and puzzle_id = $2 and solved", [playerId, daily.puzzle.id])).rowCount
    : false
  return { games: games.rows, puzzlesSolved: puzzles.rows[0].n, dailySolved }
}

const listFor = async (player: Player) => {
  const day = indiaDay()
  const [d, claims] = await Promise.all([
    dayData(player.id, day),
    pool.query("select mission_id from play.mission_claim where player_id = $1 and day = $2::date", [player.id, day]),
  ])
  const claimed = new Set(claims.rows.map((r) => r.mission_id as string))
  return {
    day,
    missions: missionsFor(player.id, day).map((m) => {
      const progress = Math.min(m.target, m.progress(d, player.id))
      return { id: m.id, title: m.title, target: m.target, xp: m.xp, progress, done: progress >= m.target, claimed: claimed.has(m.id) }
    }),
  }
}

export const missionRoute = async (method: string, path: string, player: Player | null): Promise<{ status: number; body: unknown } | null> => {
  if (!path.startsWith("/missions")) return null
  if (!player) return { status: 401, body: { error: "sign-in" } }
  if (method === "GET" && path === "/missions") return { status: 200, body: { ...(await listFor(player)), can_claim: !isGuest(player.id) } }
  const m = /^\/missions\/([a-z0-9]{2,20})\/claim$/.exec(path)
  if (m && method === "POST") {
    if (isGuest(player.id)) return { status: 403, body: { error: "sign-in" } }
    const list = await listFor(player)
    const mission = list.missions.find((x) => x.id === m[1])
    if (!mission || !mission.done) return { status: 400, body: { error: "not-done" } }
    const r = await pool.query("insert into play.mission_claim (player_id, day, mission_id, xp) values ($1, $2::date, $3, $4) on conflict do nothing", [
      player.id,
      list.day,
      mission.id,
      mission.xp,
    ])
    if (r.rowCount) await addXp(player.id, mission.xp)
    return { status: 200, body: { ok: true, xp: r.rowCount ? mission.xp : 0, ...(await listFor(player)) } }
  }
  return { status: 404, body: { error: "not-found" } }
}
