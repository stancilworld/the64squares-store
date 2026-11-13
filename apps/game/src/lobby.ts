import pg from "pg"
import type { Server, Socket } from "socket.io"
import { cleanText } from "./chat.js"
import { config } from "./config.js"
import { pool } from "./db.js"
import { isGuest, type Player } from "./game.js"
import { ageOn, canWrite, type Channel, cooldownMs, DEFAULT_SETTINGS, isOpen, type Kind, LOBBY_QUICK, lobbyWindow, type PlayersChat, readable, type Role, type Settings, type SpectatorChat, type Who } from "./lobby-rules.js"
import { cardOf } from "./seek.js"

// Tournament lobbies: where players wait for their games with the moderators, and where
// spectators follow along. Three kinds of people, told apart everywhere:
//   moderators (staff, or players the staff picked: play.moderator, for one tournament or all),
//   players (confirmed registration),
//   spectators (everyone else; guests read only).
// Chats: "players" (players and moderators), "spectators" (anyone), "arbiter" (a private
// thread between one player and the moderators) and announcements to everyone.
// Messages are stored (play.lobby_msg) so moderators and staff can review them. Typed text
// is filtered like game chat; children (from the date of birth on their player profile) send
// the quick messages only, except to the arbiter.
//
// Staff change things from the admin too; it tells this server with NOTIFY lobby.

export const migrateLobby = async () => {
  await pool.query(`
    create table if not exists play.moderator (
      scope text not null,
      player_id text not null,
      name text,
      added_by text,
      created_at timestamptz not null default now(),
      primary key (scope, player_id)
    );
    create table if not exists play.lobby_settings (
      tournament_id text primary key,
      players_chat text not null default 'quick',
      spectator_chat text not null default 'open',
      pinned text,
      voice_on boolean not null default false,
      updated_by text,
      updated_at timestamptz not null default now()
    );
    create table if not exists play.lobby_msg (
      id bigserial primary key,
      tournament_id text not null,
      channel text not null,
      thread text,
      author_id text not null,
      author_name text not null,
      role text not null,
      kind text not null,
      text text not null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz,
      deleted_by text
    );
    create index if not exists lobby_msg_t_idx on play.lobby_msg (tournament_id, created_at desc);
    create table if not exists play.lobby_mute (
      tournament_id text not null,
      player_id text not null,
      until timestamptz,
      removed boolean not null default false,
      by text,
      at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
  `)
}

type T = { id: string; title: string; handle: string; format: string; starts_at: number; ends_at: number | null; check_in_minutes: number; status: string; finished_at: number | null }
type Msg = { id: string; channel: Channel; thread: string | null; kind: Kind; text: string; at: number; author: { id: string; name: string; role: Role } }
type Here = { id: string; name: string; role: Role }
type WhoRow = Who & { at: number; mutedUntil: number | null }

const ms = (d: unknown) => (d ? new Date(d as string).getTime() : null)

const rowMsg = (r: Record<string, unknown>): Msg => ({
  id: String(r.id),
  channel: r.channel as Channel,
  thread: (r.thread as string | null) ?? null,
  kind: r.kind as Kind,
  text: r.text as string,
  at: ms(r.created_at)!,
  author: { id: r.author_id as string, name: r.author_name as string, role: r.role as Role },
})

export class Lobbies {
  private settings = new Map<string, { at: number; s: Settings }>()
  private whos = new Map<string, WhoRow>()
  private here = new Map<string, Map<string, Here>>()
  private presenceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastSent = new Map<string, number>()

  constructor(private io: Server) {}

  // Changes made in the admin (settings, deleted messages, moderators, mutes).
  async listen() {
    const client = new pg.Client({ connectionString: config.databaseUrl })
    client.on("error", (e) => {
      console.error("lobby listen", e)
      setTimeout(() => void this.listen(), 5000).unref()
    })
    await client.connect()
    await client.query("listen lobby")
    client.on("notification", (n) => {
      try {
        const p = JSON.parse(n.payload ?? "{}") as { tid?: string; what?: string; id?: string }
        if (!p.tid) return
        if (p.what === "deleted" && p.id) this.io.to(`lobby:${p.tid}`).emit("lobby:deleted", { tid: p.tid, id: p.id })
        if (p.what === "settings") {
          this.settings.delete(p.tid)
          void this.getSettings(p.tid).then((s) => this.io.to(`lobby:${p.tid}`).emit("lobby:settings", { tid: p.tid, settings: s }))
        }
        if (p.what === "people") {
          for (const k of this.whos.keys()) if (p.tid === "*" || k.startsWith(`${p.tid}|`)) this.whos.delete(k)
          this.io.to(p.tid === "*" ? "lobbies" : `lobby:${p.tid}`).emit("lobby:refresh", { tid: p.tid })
        }
      } catch {}
    })
  }

  private async loadT(idOrHandle: string): Promise<T | null> {
    const { rows } = await pool.query(
      `select t.id, t.title, t.handle, t.format, t.starts_at, t.ends_at, t.check_in_minutes, t.status, s.finished_at
         from public.tournament t left join play.t_state s on s.tournament_id = t.id
        where (t.id = $1 or t.handle = $1) and t.deleted_at is null and t.status <> 'draft' and t.mode = 'online'`,
      [idOrHandle]
    )
    const r = rows[0]
    if (!r) return null
    return { ...r, starts_at: ms(r.starts_at)!, ends_at: ms(r.ends_at), finished_at: ms(r.finished_at), check_in_minutes: Number(r.check_in_minutes ?? 0) }
  }

  private windowOf(t: T) {
    return lobbyWindow({ starts_at: t.starts_at, check_in_minutes: t.check_in_minutes, ends_at: t.ends_at, finished_at: t.finished_at, cancelled: t.status === "cancelled" })
  }

  async getSettings(tid: string): Promise<Settings> {
    const hit = this.settings.get(tid)
    if (hit && Date.now() - hit.at < 30_000) return hit.s
    const { rows } = await pool.query("select players_chat, spectator_chat, pinned, voice_on from play.lobby_settings where tournament_id = $1", [tid])
    const s: Settings = rows[0] ? { ...DEFAULT_SETTINGS, ...rows[0] } : DEFAULT_SETTINGS
    this.settings.set(tid, { at: Date.now(), s })
    return s
  }

  private async who(tid: string, p: Player | null): Promise<WhoRow> {
    if (!p) return { role: "spectator", signedIn: false, minor: false, muted: false, removed: false, at: Date.now(), mutedUntil: null }
    const key = `${tid}|${p.id}`
    const hit = this.whos.get(key)
    if (hit && Date.now() - hit.at < 30_000) {
      const muted = hit.mutedUntil != null && hit.mutedUntil > Date.now()
      return { ...hit, muted }
    }
    let role: Role = "spectator"
    let minor = false
    if (!isGuest(p.id)) {
      const [mod, reg, cust] = await Promise.all([
        pool.query("select 1 from play.moderator where player_id = $1 and scope in ('*', $2) limit 1", [p.id, tid]),
        pool
          .query("select 1 from public.tournament_registration where tournament_id = $1 and customer_id = $2 and status = 'confirmed' and deleted_at is null limit 1", [tid, p.id])
          .catch(() => ({ rows: [] })),
        pool.query("select metadata->'t64_player'->>'dob' as dob from public.customer where id = $1", [p.id]).catch(() => ({ rows: [] as { dob: string | null }[] })),
      ])
      role = mod.rows.length ? "moderator" : reg.rows.length ? "player" : "spectator"
      const age = ageOn(cust.rows[0]?.dob)
      minor = age != null && age < 18
    }
    const { rows } = await pool.query("select until, removed from play.lobby_mute where tournament_id = $1 and player_id = $2", [tid, p.id])
    const mutedUntil = ms(rows[0]?.until)
    const w: WhoRow = {
      role,
      signedIn: !isGuest(p.id),
      minor,
      removed: !!rows[0]?.removed,
      mutedUntil,
      muted: mutedUntil != null && mutedUntil > Date.now(),
      at: Date.now(),
    }
    this.whos.set(key, w)
    return w
  }

  private async history(tid: string, role: Role, playerId: string | null) {
    const channels = readable(role).filter((c) => c !== "arbiter")
    const { rows } = await pool.query(
      `select * from (
         select *, row_number() over (partition by channel order by created_at desc) as n
           from play.lobby_msg where tournament_id = $1 and deleted_at is null and channel = any($2)
       ) x where n <= 80 order by created_at asc`,
      [tid, channels]
    )
    let arbiter: Record<string, unknown>[] = []
    if (role === "moderator") {
      arbiter = (await pool.query("select * from play.lobby_msg where tournament_id = $1 and channel = 'arbiter' and deleted_at is null order by created_at desc limit 150", [tid])).rows.reverse()
    } else if (role === "player" && playerId) {
      arbiter = (await pool.query("select * from play.lobby_msg where tournament_id = $1 and channel = 'arbiter' and thread = $2 and deleted_at is null order by created_at asc limit 60", [tid, playerId])).rows
    }
    return [...rows, ...arbiter].map(rowMsg)
  }

  private schedulePresence(tid: string) {
    if (this.presenceTimers.has(tid)) return
    this.presenceTimers.set(
      tid,
      setTimeout(() => {
        this.presenceTimers.delete(tid)
        void this.presence(tid).then((p) => this.io.to(`lobby:${tid}`).emit("lobby:presence", { tid, ...p }))
      }, 800)
    )
  }

  async presence(tid: string) {
    const list = [...(this.here.get(tid)?.values() ?? [])]
    const uniq = (role: Role) => [...new Map(list.filter((h) => h.role === role).map((h) => [h.id, h])).values()]
    const card = async (h: Here) => {
      const c = await cardOf(h.id).catch(() => null)
      return { id: h.id, name: c && c.name !== "Guest" ? c.name : h.name, avatar_url: c?.avatar_url ?? null, username: c?.username ?? null }
    }
    const spectators = new Set(list.filter((h) => h.role === "spectator").map((h) => h.id)).size
    return {
      moderators: await Promise.all(uniq("moderator").map(card)),
      players: await Promise.all(uniq("player").slice(0, 300).map(card)),
      spectators,
    }
  }

  private emitMsg(tid: string, m: Msg) {
    const out = { tid, ...m }
    if (m.channel === "all" || m.channel === "spectators") this.io.to(`lobby:${tid}`).emit("lobby:msg", out)
    else if (m.channel === "players") this.io.to(`lobby:${tid}:p`).emit("lobby:msg", out)
    else if (m.channel === "arbiter" && m.thread) this.io.to(`lobby:${tid}:m`).to(`lobby:${tid}:u:${m.thread}`).emit("lobby:msg", out)
  }

  private async post(tid: string, channel: Channel, thread: string | null, author: { id: string; name: string; role: Role }, kind: Kind, text: string) {
    const { rows } = await pool.query(
      `insert into play.lobby_msg (tournament_id, channel, thread, author_id, author_name, role, kind, text)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [tid, channel, thread, author.id, author.name, author.role, kind, text]
    )
    const m = rowMsg(rows[0])
    this.emitMsg(tid, m)
    return m
  }

  register(socket: Socket, me: () => Player | null, limited: (s: Socket, ack?: unknown) => boolean) {
    const joined = new Set<string>()
    const leave = (tid: string) => {
      joined.delete(tid)
      for (const r of [...socket.rooms]) if (r === `lobby:${tid}` || r.startsWith(`lobby:${tid}:`)) socket.leave(r)
      this.here.get(tid)?.delete(socket.id)
      this.schedulePresence(tid)
    }

    socket.on("lobby:join", async (idOrHandle: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack) || typeof idOrHandle !== "string" || idOrHandle.length > 120) return
      try {
        const t = await this.loadT(idOrHandle)
        if (!t) return ack({ ok: false, error: "not-found" })
        if (joined.has(t.id)) leave(t.id)
        const p = me()
        const w = await this.who(t.id, p)
        const win = this.windowOf(t)
        socket.join(["lobbies", `lobby:${t.id}`])
        if (w.role !== "spectator") socket.join(`lobby:${t.id}:p`)
        if (w.role === "moderator") socket.join(`lobby:${t.id}:m`)
        if (p) socket.join(`lobby:${t.id}:u:${p.id}`)
        joined.add(t.id)
        if (!this.here.has(t.id)) this.here.set(t.id, new Map())
        this.here.get(t.id)!.set(socket.id, { id: p?.id ?? `anon_${socket.id}`, name: p?.name ?? "Guest", role: w.role })
        this.schedulePresence(t.id)
        ack({
          ok: true,
          tid: t.id,
          server_now: Date.now(),
          window: { ...win, open: isOpen(win, Date.now()) },
          role: w.role,
          me: p ? { id: p.id, name: p.name, guest: isGuest(p.id), minor: w.minor, muted_until: w.muted ? w.mutedUntil : null, removed: w.removed } : null,
          settings: await this.getSettings(t.id),
          quick: LOBBY_QUICK,
          messages: await this.history(t.id, w.role, p?.id ?? null),
          presence: await this.presence(t.id),
        })
      } catch (e) {
        console.error("lobby:join", e)
        ack({ ok: false, error: "server-error" })
      }
    })

    socket.on("lobby:leave", (tid: unknown) => {
      if (typeof tid === "string" && joined.has(tid)) leave(tid)
    })
    socket.on("disconnect", () => {
      for (const tid of [...joined]) leave(tid)
    })

    socket.on("lobby:send", async (input: { tid?: unknown; channel?: unknown; kind?: unknown; text?: unknown; thread?: unknown }, ack: unknown) => {
      const reply = typeof ack === "function" ? (ack as (r: Record<string, unknown>) => void) : () => {}
      if (limited(socket, ack)) return
      const tid = input?.tid
      const p = me()
      if (typeof tid !== "string" || !joined.has(tid) || typeof input.text !== "string") return reply({ ok: false, error: "bad-request" })
      const channel = input.channel as Channel
      const kind = input.kind as Kind
      if (!["players", "spectators", "arbiter"].includes(channel) || !["text", "quick"].includes(kind)) return reply({ ok: false, error: "bad-request" })
      try {
        const t = await this.loadT(tid)
        if (!t || !isOpen(this.windowOf(t), Date.now())) return reply({ ok: false, error: "closed" })
        const w = await this.who(tid, p)
        const s = await this.getSettings(tid)
        const no = canWrite(w, s, channel, kind)
        if (no) return reply({ ok: false, error: no, until: w.mutedUntil })
        let text: string
        if (kind === "quick") {
          if (!(LOBBY_QUICK as readonly string[]).includes(input.text)) return reply({ ok: false, error: "bad-request" })
          text = input.text
        } else {
          text = cleanText(input.text, w.role === "moderator" ? 400 : 200)
          if (!text) return reply({ ok: false, error: "empty" })
        }
        // Players write in their own arbiter thread; moderators answer in a player's thread.
        let thread: string | null = null
        if (channel === "arbiter") {
          thread = w.role === "moderator" ? (typeof input.thread === "string" && input.thread.startsWith("cus_") ? input.thread : null) : p!.id
          if (!thread) return reply({ ok: false, error: "bad-request" })
        }
        const key = `${tid}|${p!.id}|${channel}`
        const last = this.lastSent.get(key) ?? 0
        const wait = cooldownMs(w, s, channel) - (Date.now() - last)
        if (wait > 0) return reply({ ok: false, error: "slow-down", wait_ms: wait })
        this.lastSent.set(key, Date.now())
        await this.post(tid, channel, thread, { id: p!.id, name: p!.name, role: w.role }, kind, text)
        reply({ ok: true })
      } catch (e) {
        console.error("lobby:send", e)
        reply({ ok: false, error: "server-error" })
      }
    })

    // Moderator tools.
    socket.on("lobby:mod", async (input: Record<string, unknown>, ack: unknown) => {
      const reply = typeof ack === "function" ? (ack as (r: Record<string, unknown>) => void) : () => {}
      if (limited(socket, ack)) return
      const tid = input?.tid
      const p = me()
      if (typeof tid !== "string" || !joined.has(tid) || !p) return reply({ ok: false, error: "bad-request" })
      try {
        const w = await this.who(tid, p)
        if (w.role !== "moderator") return reply({ ok: false, error: "moderators-only" })
        const author = { id: p.id, name: p.name, role: "moderator" as Role }
        switch (input.action) {
          case "settings": {
            const cur = await this.getSettings(tid)
            const next: Settings = {
              ...cur,
              players_chat: ["open", "quick", "off"].includes(input.players_chat as string) ? (input.players_chat as PlayersChat) : cur.players_chat,
              spectator_chat: ["open", "slow", "off"].includes(input.spectator_chat as string) ? (input.spectator_chat as SpectatorChat) : cur.spectator_chat,
            }
            await this.saveSettings(tid, next, p.id)
            const note =
              next.players_chat !== cur.players_chat
                ? { open: "Players' chat is open.", quick: "Players' chat: quick messages only.", off: "Players' chat is closed. You can still ask the arbiter." }[next.players_chat]
                : next.spectator_chat !== cur.spectator_chat
                  ? { open: "Spectators' chat is open.", slow: "Spectators' chat is in slow mode.", off: "Spectators' chat is closed." }[next.spectator_chat]
                  : null
            if (note) await this.post(tid, next.players_chat !== cur.players_chat ? "players" : "spectators", null, author, "system", note)
            return reply({ ok: true })
          }
          case "announce": {
            if (typeof input.text !== "string") return reply({ ok: false, error: "bad-request" })
            const text = cleanText(input.text, 400)
            if (!text) return reply({ ok: false, error: "empty" })
            await this.post(tid, "all", null, author, "announce", text)
            if (input.pin === true) await this.saveSettings(tid, { ...(await this.getSettings(tid)), pinned: text }, p.id)
            return reply({ ok: true })
          }
          case "unpin":
            await this.saveSettings(tid, { ...(await this.getSettings(tid)), pinned: null }, p.id)
            return reply({ ok: true })
          case "delete": {
            if (typeof input.id !== "string" || !/^\d{1,18}$/.test(input.id)) return reply({ ok: false, error: "bad-request" })
            await pool.query("update play.lobby_msg set deleted_at = now(), deleted_by = $3 where id = $1 and tournament_id = $2", [input.id, tid, p.id])
            this.io.to(`lobby:${tid}`).emit("lobby:deleted", { tid, id: input.id })
            return reply({ ok: true })
          }
          case "mute":
          case "remove":
          case "restore": {
            const pid = input.player_id
            if (typeof pid !== "string" || !pid.startsWith("cus_") || pid === p.id) return reply({ ok: false, error: "bad-request" })
            const target = await this.who(tid, { id: pid, name: "" })
            if (target.role === "moderator") return reply({ ok: false, error: "is-moderator" })
            const minutes = Math.min(Math.max(Number(input.minutes) || 10, 1), 24 * 60)
            if (input.action === "restore") await pool.query("delete from play.lobby_mute where tournament_id = $1 and player_id = $2", [tid, pid])
            else
              await pool.query(
                `insert into play.lobby_mute (tournament_id, player_id, until, removed, by) values ($1,$2,$3,$4,$5)
                 on conflict (tournament_id, player_id) do update set until = excluded.until, removed = excluded.removed, by = excluded.by, at = now()`,
                [tid, pid, input.action === "mute" ? new Date(Date.now() + minutes * 60_000) : null, input.action === "remove", p.id]
              )
            this.whos.delete(`${tid}|${pid}`)
            const after = await this.who(tid, { id: pid, name: "" })
            this.io.to(`lobby:${tid}:u:${pid}`).emit("lobby:you", { tid, muted_until: after.muted ? after.mutedUntil : null, removed: after.removed })
            return reply({ ok: true })
          }
          default:
            return reply({ ok: false, error: "bad-request" })
        }
      } catch (e) {
        console.error("lobby:mod", e)
        reply({ ok: false, error: "server-error" })
      }
    })
  }

  private async saveSettings(tid: string, s: Settings, by: string) {
    await pool.query(
      `insert into play.lobby_settings (tournament_id, players_chat, spectator_chat, pinned, voice_on, updated_by) values ($1,$2,$3,$4,$5,$6)
       on conflict (tournament_id) do update set players_chat = excluded.players_chat, spectator_chat = excluded.spectator_chat,
         pinned = excluded.pinned, voice_on = excluded.voice_on, updated_by = excluded.updated_by, updated_at = now()`,
      [tid, s.players_chat, s.spectator_chat, s.pinned, s.voice_on, by]
    )
    this.settings.set(tid, { at: Date.now(), s })
    this.io.to(`lobby:${tid}`).emit("lobby:settings", { tid, settings: s })
  }

  // Lobbies a player can enter now (for "Live now"): tournaments they play in or moderate.
  async openFor(playerId: string) {
    if (isGuest(playerId)) return []
    const { rows } = await pool.query(
      `select t.id, t.title, t.handle, t.format, t.mode, t.time_control, t.starts_at, t.ends_at, t.check_in_minutes, t.status, s.finished_at,
              exists (select 1 from play.moderator m where m.player_id = $1 and m.scope in ('*', t.id)) as moderating
         from public.tournament t left join play.t_state s on s.tournament_id = t.id
        where t.deleted_at is null and t.status = 'published' and t.mode = 'online'
          and t.starts_at < now() + interval '1 day' and coalesce(s.finished_at, t.ends_at, t.starts_at + interval '6 hours') > now() - interval '1 hour'
          and (exists (select 1 from public.tournament_registration r where r.tournament_id = t.id and r.customer_id = $1 and r.status = 'confirmed' and r.deleted_at is null)
               or exists (select 1 from play.moderator m where m.player_id = $1 and m.scope in ('*', t.id)))
        order by t.starts_at asc limit 10`,
      [playerId]
    )
    const now = Date.now()
    return rows
      .map((r) => {
        const w = lobbyWindow({ starts_at: ms(r.starts_at)!, check_in_minutes: Number(r.check_in_minutes ?? 0), ends_at: ms(r.ends_at), finished_at: ms(r.finished_at), cancelled: false })
        return { id: r.id, title: r.title, handle: r.handle, format: r.format, mode: r.mode, time_control: r.time_control, starts_at: r.starts_at, ends_at: r.ends_at, moderating: !!r.moderating, open: isOpen(w, now), opens_at: new Date(w.opens_at).toISOString() }
      })
      .filter((r) => r.open)
  }
}
