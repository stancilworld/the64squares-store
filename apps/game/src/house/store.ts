import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { config } from "../config.js"
import { pool } from "../db.js"
import { DEFAULT_RATING, type Speed } from "../glicko.js"
import { HOUSE_PREFIX, makePersona, type Persona, rng } from "./persona.js"

// House Players live in play.house (their habits) and, like everyone, in play.profile and
// play.rating. The roster is made once (seeded) and kept; their ratings then move with the
// games they play, like anyone's.

export const ROSTER_SIZE = 1200

export const migrateHouse = async () => {
  await pool.query(`
    create table if not exists play.house (
      player_id text primary key,
      persona jsonb not null,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );
  `)
}

const SPEEDS: Speed[] = ["bullet", "blitz", "rapid", "classical"]

// A simple picture for some players: a symmetric pattern in two colours, like many sites'
// default avatars (no photos of real people).
const PALETTE = ["#2E7D32", "#1565C0", "#6A1B9A", "#C62828", "#EF6C00", "#00838F", "#4E342E", "#37474F", "#AD1457", "#558B2F", "#283593", "#00695C"]
const patternAvatar = async (seed: number) => {
  const r = rng(seed * 31 + 5)
  const fg = PALETTE[Math.floor(r() * PALETTE.length)]
  const bg = r() < 0.5 ? "#F4F1EA" : "#E8EEF2"
  const cells: string[] = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (r() < 0.5) continue
      for (const xx of x === 2 ? [2] : [x, 4 - x]) cells.push(`<rect x="${20 + xx * 43}" y="${20 + y * 43}" width="43" height="43" fill="${fg}"/>`)
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${bg}"/>${cells.join("")}</svg>`
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer()
}

// Creates the roster the first time (and tops it up if it was made smaller before).
export const seedHouse = async () => {
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from play.house")
  if (rows[0].n >= ROSTER_SIZE) return 0
  let made = 0
  await fs.mkdir(config.avatarDir, { recursive: true })
  for (let seed = 1; made + rows[0].n < ROSTER_SIZE && seed < ROSTER_SIZE * 3; seed++) {
    const id = `${HOUSE_PREFIX}${seed.toString(36).padStart(4, "0")}`
    const exists = await pool.query("select 1 from play.house where player_id = $1", [id])
    if (exists.rowCount) continue
    const p = makePersona(seed)
    // A free username (a real player may already have it).
    let username = p.username
    for (let i = 0; i < 6; i++) {
      const taken = await pool.query("select 1 from play.profile where lower(username) = lower($1)", [username])
      if (!taken.rowCount && username.length >= 3) break
      username = `${p.username.slice(0, 16)}${Math.floor(rng(seed + i)() * 900) + 100}`
    }
    let avatar: string | null = null
    if (p.avatar) {
      avatar = `${id}-p.webp`
      await fs.writeFile(path.join(config.avatarDir, avatar), await patternAvatar(seed))
    }
    const persona: Persona = { ...p, id, username }
    const client = await pool.connect()
    try {
      await client.query("begin")
      const ins = await client.query(
        `insert into play.profile (player_id, username, display_name, avatar, bio, city)
         values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning player_id`,
        [id, username, p.display_name.slice(0, 40), avatar, p.bio, p.city]
      )
      if (!ins.rowCount) {
        await client.query("rollback")
        continue
      }
      await client.query("insert into play.house (player_id, persona) values ($1, $2)", [id, JSON.stringify(persona)])
      // Starting ratings at the player's strength (bullet a little lower, slow games a little higher).
      for (const speed of SPEEDS) {
        const shift = speed === "bullet" ? -60 : speed === "blitz" ? 0 : speed === "rapid" ? 40 : 60
        await client.query(
          `insert into play.rating (player_id, speed, name, rating, rd, vol) values ($1, $2, $3, $4, $5, $6)
           on conflict do nothing`,
          [id, speed, p.display_name, p.strength + shift, 90, DEFAULT_RATING.vol]
        )
      }
      await client.query("commit")
      made++
    } catch (e) {
      await client.query("rollback")
      throw e
    } finally {
      client.release()
    }
  }
  return made
}

const cache = new Map<string, Persona>()

export const personaOf = async (id: string) => {
  const hit = cache.get(id)
  if (hit) return hit
  const { rows } = await pool.query<{ persona: Persona }>("select persona from play.house where player_id = $1", [id])
  const p = rows[0]?.persona ?? null
  if (p) cache.set(id, p)
  return p
}

// A House Player for someone waiting: free right now, close to the wanted rating, and not
// one they've played recently (so the same faces don't keep coming back).
export const pickHouse = async (o: { forPlayer: string; speed: Speed; target: number; busy: Set<string> }) => {
  const recent = await pool.query<{ id: string }>(
    `select case when white_id = $1 then black_id else white_id end as id
       from play.game where (white_id = $1 or black_id = $1) and started_at > now() - interval '30 days'
      order by started_at desc limit 40`,
    [o.forPlayer]
  )
  const avoid = new Set([...o.busy, ...recent.rows.map((x) => x.id)])
  for (const width of [60, 120, 220, 400, 5000]) {
    const { rows } = await pool.query<{ player_id: string; rating: number }>(
      `select h.player_id, r.rating from play.house h
         join play.rating r on r.player_id = h.player_id and r.speed = $1
        where h.active and abs(r.rating - $2) <= $3
        order by random() limit 40`,
      [o.speed, o.target, width]
    )
    const free = rows.filter((x) => !avoid.has(x.player_id))
    if (free.length) {
      // Closest few, then one of them at random.
      free.sort((a, b) => Math.abs(a.rating - o.target) - Math.abs(b.rating - o.target))
      return free[Math.floor(Math.random() * Math.min(4, free.length))].player_id
    }
  }
  return null
}

export const houseCount = async () => (await pool.query<{ n: number }>("select count(*)::int as n from play.house where active")).rows[0].n
