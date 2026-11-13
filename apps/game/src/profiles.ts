import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { config } from "./config.js"
import { pool } from "./db.js"
import { isGuest, type Player } from "./game.js"
import { levelFor } from "./levels.js"

// Player profiles: a unique username, the name shown at the board, a picture, a few words,
// and experience points (XP) earned by playing. Guests have no profile.

export const migrateProfiles = async () => {
  await pool.query(`
    create table if not exists play.profile (
      player_id text primary key,
      username text not null,
      display_name text not null,
      avatar text,
      bio text not null default '',
      city text not null default '',
      xp integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index if not exists profile_username_idx on play.profile (lower(username));
    create index if not exists profile_xp_idx on play.profile (xp desc);
    -- XP boosts (2x XP for a day and the like), given by the shop's adverts
    -- (backend workflows/showcase.ts). While one is on, XP earned is multiplied.
    create table if not exists play.xp_boost (
      id bigserial primary key,
      player_id text not null,
      factor numeric(4, 2) not null,
      ends_at timestamptz not null,
      source text not null default '',
      created_at timestamptz not null default now()
    );
    create index if not exists xp_boost_player_idx on play.xp_boost (player_id, ends_at);
  `)
}

export type Profile = {
  player_id: string
  username: string
  display_name: string
  avatar: string | null
  bio: string
  city: string
  xp: number
  created_at: Date
}

const USERNAME = /^[a-z0-9_]{3,20}$/
const RESERVED = new Set(["admin", "support", "the64squares", "computer", "guest", "moderator", "system", "official", "staff"])

export const usernameProblem = (u: string) => {
  if (!USERNAME.test(u)) return "Use 3 to 20 lowercase letters, numbers or _"
  if (RESERVED.has(u) || u.startsWith("guest")) return "That username is reserved"
  return null
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14) || "player"

// The first time a signed-in player connects, they get a profile with a free username.
export const ensureProfile = async (p: Player): Promise<Profile | null> => {
  if (isGuest(p.id)) return null
  const found = await pool.query<Profile>("select * from play.profile where player_id = $1", [p.id])
  if (found.rows[0]) return found.rows[0]
  const base = slug(p.name)
  for (let i = 0; i < 20; i++) {
    const username = i === 0 && !RESERVED.has(base) && base.length >= 3 ? base : `${base}${crypto.randomInt(10, 9999)}`
    const r = await pool.query<Profile>(
      `insert into play.profile (player_id, username, display_name) values ($1, $2, $3)
       on conflict do nothing returning *`,
      [p.id, username, p.name.slice(0, 40)]
    )
    if (r.rows[0]) return r.rows[0]
    const again = await pool.query<Profile>("select * from play.profile where player_id = $1", [p.id])
    if (again.rows[0]) return again.rows[0]
  }
  return null
}

export const avatarUrl = (avatar: string | null) => (avatar ? `${config.publicUrl}/game/avatars/${avatar}` : null)

// What anyone may see about a player.
export const publicProfile = (p: Profile) => ({
  player_id: p.player_id,
  username: p.username,
  display_name: p.display_name,
  avatar_url: avatarUrl(p.avatar),
  bio: p.bio,
  city: p.city,
  xp: p.xp,
  level: levelFor(p.xp),
  joined: p.created_at,
})

export const getProfile = async (idOrUsername: string) => {
  const r = await pool.query<Profile>("select * from play.profile where player_id = $1 or lower(username) = lower($1) limit 1", [idOrUsername])
  return r.rows[0] ?? null
}

export const getProfiles = async (ids: string[]) => {
  if (!ids.length) return []
  const r = await pool.query<Profile>("select * from play.profile where player_id = any($1)", [ids])
  return r.rows
}

export const searchProfiles = async (q: string, limit = 20) => {
  const term = q.trim().toLowerCase().replace(/[%_\\]/g, "")
  if (term.length < 2) return []
  const r = await pool.query<Profile>(
    `select * from play.profile
      where lower(username) like $1 or lower(display_name) like $2
      order by (lower(username) = $3) desc, xp desc limit $4`,
    [`${term}%`, `%${term}%`, term, limit]
  )
  return r.rows
}

export type ProfileEdit = { username?: unknown; display_name?: unknown; bio?: unknown; city?: unknown }

export const updateProfile = async (playerId: string, input: ProfileEdit) => {
  const cur = await getProfile(playerId)
  if (!cur) return { ok: false as const, error: "no-profile" }
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined)
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : cur.username
  const display_name = text(input.display_name, 40) ?? cur.display_name
  const bio = typeof input.bio === "string" ? input.bio.trim().slice(0, 200) : cur.bio
  const city = text(input.city, 60) ?? cur.city
  if (username !== cur.username) {
    const problem = usernameProblem(username)
    if (problem) return { ok: false as const, error: problem }
  }
  if (display_name.length < 2) return { ok: false as const, error: "Your name needs at least 2 letters" }
  try {
    const r = await pool.query<Profile>(
      `update play.profile set username = $2, display_name = $3, bio = $4, city = $5, updated_at = now()
        where player_id = $1 returning *`,
      [playerId, username, display_name, bio, city]
    )
    return { ok: true as const, profile: publicProfile(r.rows[0]) }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false as const, error: "That username is taken" }
    throw e
  }
}

// A new picture: any common image, turned into a 256 px square WebP.
export const setAvatar = async (playerId: string, image: Buffer) => {
  const cur = await getProfile(playerId)
  if (!cur) return { ok: false as const, error: "no-profile" }
  let out: Buffer
  try {
    out = await sharp(image, { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer()
  } catch {
    return { ok: false as const, error: "That file isn't a picture we can use" }
  }
  const name = `${playerId.replace(/[^A-Za-z0-9_]/g, "")}-${crypto.randomBytes(4).toString("hex")}.webp`
  await fs.mkdir(config.avatarDir, { recursive: true })
  await fs.writeFile(path.join(config.avatarDir, name), out)
  await pool.query("update play.profile set avatar = $2, updated_at = now() where player_id = $1", [playerId, name])
  if (cur.avatar) await fs.rm(path.join(config.avatarDir, path.basename(cur.avatar)), { force: true })
  return { ok: true as const, avatar_url: avatarUrl(name) }
}

export const removeAvatar = async (playerId: string) => {
  const cur = await getProfile(playerId)
  if (!cur?.avatar) return
  await pool.query("update play.profile set avatar = null, updated_at = now() where player_id = $1", [playerId])
  await fs.rm(path.join(config.avatarDir, path.basename(cur.avatar)), { force: true })
}

export const readAvatar = async (file: string) => {
  if (!/^[A-Za-z0-9_-]+\.webp$/.test(file)) return null
  try {
    return await fs.readFile(path.join(config.avatarDir, file))
  } catch {
    return null
  }
}

// The XP boost on for a player now (the biggest, if several), or null.
export const activeBoost = async (playerId: string): Promise<{ factor: number; ends_at: string } | null> => {
  if (isGuest(playerId)) return null
  const { rows } = await pool.query(
    "select factor, ends_at from play.xp_boost where player_id = $1 and ends_at > now() order by factor desc, ends_at desc limit 1",
    [playerId]
  )
  return rows[0] ? { factor: Number(rows[0].factor), ends_at: new Date(rows[0].ends_at).toISOString() } : null
}

export const addXp = async (playerId: string, xp: number) => {
  if (isGuest(playerId) || xp <= 0) return
  const boost = await activeBoost(playerId)
  await pool.query("update play.profile set xp = xp + $2 where player_id = $1", [playerId, Math.round(xp * (boost?.factor ?? 1))])
}
