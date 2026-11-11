import { pool } from "./db.js"
import { FIDE_LISTS, FIDE_SPEEDS, type FideList, type FideSpeed, type TopLists, displayName, readList } from "./fide-rules.js"

// FIDE rankings: FIDE publishes its full rating lists as free monthly downloads. Once a month
// (checked twice a day) the server downloads the standard, rapid and blitz lists, keeps the top
// 100 of each ranking (open, women, juniors, girls, India, India women) and stores them here.

const SOURCE: Record<FideSpeed, string> = {
  standard: "https://ratings.fide.com/download/standard_rating_list_xml.zip",
  rapid: "https://ratings.fide.com/download/rapid_rating_list_xml.zip",
  blitz: "https://ratings.fide.com/download/blitz_rating_list_xml.zip",
}

export const migrateFide = async () => {
  await pool.query(`
    create table if not exists play.fide_top (
      speed text not null,
      list text not null,
      rank integer not null,
      fide_id integer not null,
      name text not null,
      fed text not null,
      sex text not null,
      title text,
      rating integer not null,
      games integer not null default 0,
      birth_year integer,
      primary key (speed, list, rank)
    );
    create table if not exists play.fide_meta (
      speed text primary key,
      period text not null,
      fetched_at timestamptz not null default now()
    );
  `)
}

const save = async (speed: FideSpeed, top: TopLists, period: string) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query("delete from play.fide_top where speed = $1", [speed])
    for (const list of FIDE_LISTS) {
      const rows = top.get(list)
      if (!rows.length) continue
      const values: unknown[] = []
      const sql = rows.map((p, i) => {
        values.push(speed, list, i + 1, p.fide_id, displayName(p.name), p.fed, p.sex, p.title, p.rating, p.games, p.birth_year)
        const o = i * 11
        return `(${Array.from({ length: 11 }, (_, k) => `$${o + k + 1}`).join(",")})`
      })
      await client.query(
        `insert into play.fide_top (speed, list, rank, fide_id, name, fed, sex, title, rating, games, birth_year) values ${sql.join(",")}`,
        values
      )
    }
    await client.query(
      `insert into play.fide_meta (speed, period, fetched_at) values ($1, $2, now())
       on conflict (speed) do update set period = excluded.period, fetched_at = now()`,
      [speed, period]
    )
    await client.query("commit")
  } catch (e) {
    await client.query("rollback")
    throw e
  } finally {
    client.release()
  }
}

let running = false
// Fetches any list that's missing or more than ~a week old (FIDE publishes on the 1st).
export const refreshFide = async (force = false) => {
  if (running) return
  running = true
  try {
    await migrateFide()
    const { rows } = await pool.query("select speed, fetched_at from play.fide_meta")
    const last = new Map<string, Date>(rows.map((r) => [r.speed, new Date(r.fetched_at)]))
    for (const speed of FIDE_SPEEDS) {
      const at = last.get(speed)
      const now = new Date()
      const fresh = at && now.getTime() - at.getTime() < 7 * 86_400_000 && at.getUTCMonth() === now.getUTCMonth()
      if (fresh && !force) continue
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 15 * 60_000)
      try {
        const { top, period, seen } = await readList(SOURCE[speed], ctl.signal)
        await save(speed, top, period)
        console.log(`[fide] ${speed}: ${seen} players read, ${period}`)
      } catch (e) {
        console.error(`[fide] ${speed}: ${(e as Error).message}`)
      } finally {
        clearTimeout(timer)
      }
    }
  } finally {
    running = false
  }
}

export const startFide = () => {
  // A minute after start, then twice a day; only downloads when a list is due.
  setTimeout(() => void refreshFide().catch(() => {}), 60_000)
  setInterval(() => void refreshFide().catch(() => {}), 12 * 3_600_000)
}

export const fideTop = async (speed: FideSpeed, list: FideList) => {
  const [players, meta] = await Promise.all([
    pool.query(
      "select rank, fide_id, name, fed, sex, title, rating, games, birth_year from play.fide_top where speed = $1 and list = $2 order by rank",
      [speed, list]
    ),
    pool.query("select period, fetched_at from play.fide_meta where speed = $1", [speed]),
  ])
  return { speed, list, period: meta.rows[0]?.period ?? null, updated_at: meta.rows[0]?.fetched_at ?? null, players: players.rows }
}
