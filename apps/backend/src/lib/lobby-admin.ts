import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Tournament lobbies from the admin (the game server runs them; see apps/game/src/lobby.ts):
// who moderates (website accounts, for one tournament or all), the chat log with questions
// to the arbiter, deleting messages, chat settings and lifting mutes. Every change is told to
// the game server with NOTIFY lobby, so open lobbies update at once.

type Row = Record<string, any>
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }
const pg = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg

const ready = async (c: MedusaContainer) => {
  const { rows } = await pg(c).raw("select to_regclass('play.lobby_msg') as m")
  return !!rows[0]?.m
}
const notify = (c: MedusaContainer, payload: Record<string, unknown>) => pg(c).raw("select pg_notify('lobby', ?)", [JSON.stringify(payload)])

const notReady = () => new MedusaError(MedusaError.Types.NOT_ALLOWED, "The game server hasn't set up lobbies yet. Start it once, then try again.")

export const lobbyState = async (c: MedusaContainer, tournamentId: string) => {
  if (!(await ready(c))) return { ready: false, settings: null, moderators: [], messages: [], mutes: [] }
  const db = pg(c)
  const [settings, mods, msgs, mutes] = await Promise.all([
    db.raw("select players_chat, spectator_chat, pinned, voice_on, updated_at from play.lobby_settings where tournament_id = ?", [tournamentId]),
    db.raw(
      `select m.scope, m.player_id, coalesce(nullif(trim(concat(cu.first_name, ' ', cu.last_name)), ''), m.name) as name, cu.email
         from play.moderator m left join public.customer cu on cu.id = m.player_id
        where m.scope in ('*', ?) order by m.scope desc, m.created_at`,
      [tournamentId]
    ),
    db.raw(
      `select id, channel, thread, author_id, author_name, role, kind, text, created_at, deleted_at, deleted_by
         from play.lobby_msg where tournament_id = ? order by created_at desc limit 400`,
      [tournamentId]
    ),
    db.raw("select player_id, until, removed, at from play.lobby_mute where tournament_id = ? and (removed or until > now())", [tournamentId]),
  ])
  return {
    ready: true,
    settings: settings.rows[0] ?? { players_chat: "quick", spectator_chat: "open", pinned: null, voice_on: false },
    moderators: mods.rows.map((m) => ({ ...m, all: m.scope === "*" })),
    messages: msgs.rows.map((m) => ({ ...m, id: String(m.id) })),
    mutes: mutes.rows,
  }
}

export const addModerator = async (c: MedusaContainer, scope: string, email: string, by: string) => {
  if (!(await ready(c))) throw notReady()
  const { rows } = await pg(c).raw(
    "select id, first_name, last_name from public.customer where lower(email) = lower(?) and has_account = true and deleted_at is null limit 1",
    [email.trim()]
  )
  const cu = rows[0]
  if (!cu) throw new MedusaError(MedusaError.Types.NOT_FOUND, "No website account with that email. They need to sign up on the website first.")
  const name = `${cu.first_name ?? ""} ${cu.last_name ?? ""}`.trim() || email.split("@")[0]
  await pg(c).raw("insert into play.moderator (scope, player_id, name, added_by) values (?, ?, ?, ?) on conflict do nothing", [scope, cu.id, name, by])
  await notify(c, { tid: scope, what: "people" })
  return name
}

export const removeModerator = async (c: MedusaContainer, scope: string, playerId: string) => {
  if (!(await ready(c))) throw notReady()
  await pg(c).raw("delete from play.moderator where scope = ? and player_id = ?", [scope, playerId])
  await notify(c, { tid: scope, what: "people" })
}

export const deleteLobbyMessage = async (c: MedusaContainer, tournamentId: string, id: string, by: string) => {
  if (!(await ready(c))) throw notReady()
  await pg(c).raw("update play.lobby_msg set deleted_at = now(), deleted_by = ? where id = ? and tournament_id = ? and deleted_at is null", [by, id, tournamentId])
  await notify(c, { tid: tournamentId, what: "deleted", id })
}

export const saveLobbySettings = async (
  c: MedusaContainer,
  tournamentId: string,
  s: { players_chat?: string; spectator_chat?: string; pinned?: string | null },
  by: string
) => {
  if (!(await ready(c))) throw notReady()
  const cur = (await lobbyState(c, tournamentId)).settings as Row
  const next = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) }
  await pg(c).raw(
    `insert into play.lobby_settings (tournament_id, players_chat, spectator_chat, pinned, voice_on, updated_by) values (?, ?, ?, ?, ?, ?)
     on conflict (tournament_id) do update set players_chat = excluded.players_chat, spectator_chat = excluded.spectator_chat,
       pinned = excluded.pinned, updated_by = excluded.updated_by, updated_at = now()`,
    [tournamentId, next.players_chat, next.spectator_chat, next.pinned ?? null, !!next.voice_on, by]
  )
  await notify(c, { tid: tournamentId, what: "settings" })
}

export const liftMute = async (c: MedusaContainer, tournamentId: string, playerId: string) => {
  if (!(await ready(c))) throw notReady()
  await pg(c).raw("delete from play.lobby_mute where tournament_id = ? and player_id = ?", [tournamentId, playerId])
  await notify(c, { tid: tournamentId, what: "people" })
}
