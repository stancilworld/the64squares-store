import crypto from "node:crypto"
import type { Server, Socket } from "socket.io"
import { config } from "./config.js"
import { pool } from "./db.js"
import type { Player } from "./game.js"
import type { Lobbies } from "./lobby.js"
import { canTalk, type Role, VOICE_LOBBY_LISTENERS, VOICE_SITE_LISTENERS, VOICE_SPEAKERS } from "./lobby-rules.js"

// Lobby voice (LiveKit). This server decides who may join and who may talk, and hands out
// short passes; the audio itself goes through LiveKit (on the VPS, or LiveKit Cloud).
//   Site switch: Website → Site features → Lobby voice chat (asked from the backend).
//   Lobby switch: the moderator turns voice on or off for their lobby.
//   Everyone in the lobby may listen (150 a lobby, 200 across the site). Moderators may
//   talk; players when the moderator lets players talk (adults), or by name (how a child
//   gets the mic); spectators never. 6 people talking at once at most.
// Everyone joins listening only; taking the mic changes their permission on the server, so
// nobody can talk without this server agreeing.

type Lk = { url: string; key: string; secret: string; apiUrl: string }
type Cfg = { enabled: boolean; livekit: Lk | null }
type Listener = { identity: string; role: Role }

const b64 = (v: Buffer | string) => Buffer.from(v).toString("base64url")
const sign = (lk: Lk, claims: Record<string, unknown>, ttl: number) => {
  const now = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64(JSON.stringify({ iss: lk.key, nbf: now - 5, exp: now + ttl, ...claims }))
  return `${head}.${body}.${b64(crypto.createHmac("sha256", lk.secret).update(`${head}.${body}`).digest())}`
}

const roomOf = (tid: string) => `lobby-${tid}`

export class Voice {
  private cfg: { at: number; c: Cfg } | null = null
  private listeners = new Map<string, Map<string, Listener>>() // tid -> socket id -> who
  private speakers = new Map<string, Map<string, { name: string; role: Role }>>() // tid -> identity -> who
  private rooms = new Set<string>()

  constructor(
    private io: Server,
    private lobbies: Lobbies
  ) {}

  async config(): Promise<Cfg> {
    if (this.cfg && Date.now() - this.cfg.at < 20_000) return this.cfg.c
    let c: Cfg = { enabled: false, livekit: null }
    if (config.internalSecret) {
      try {
        const r = await fetch(`${config.backendUrl}/internal/voice`, { headers: { "x-t64-game-secret": config.internalSecret }, signal: AbortSignal.timeout(5000) })
        if (r.ok) c = (await r.json()) as Cfg
      } catch (e) {
        console.warn("voice config:", (e as Error).message)
        if (this.cfg) c = this.cfg.c
      }
    }
    this.cfg = { at: Date.now(), c }
    return c
  }

  async siteOn() {
    const c = await this.config()
    return c.enabled && !!c.livekit
  }

  // LiveKit's server API.
  private async api(lk: Lk, method: string, body: Record<string, unknown>, room?: string) {
    const token = sign(lk, { sub: "the64squares-game", video: { roomAdmin: true, roomCreate: true, roomList: true, ...(room ? { room } : {}) } }, 60)
    const r = await fetch(`${lk.apiUrl}/twirp/livekit.RoomService/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok && !(method === "DeleteRoom" && r.status === 404)) throw new Error(`LiveKit ${method} ${r.status}`)
    return r.json().catch(() => ({}))
  }

  private count(tid?: string) {
    if (tid) return this.listeners.get(tid)?.size ?? 0
    let n = 0
    for (const m of this.listeners.values()) n += m.size
    return n
  }

  private speakersOf(tid: string) {
    return [...(this.speakers.get(tid)?.entries() ?? [])].map(([id, s]) => ({ id, name: s.name, role: s.role }))
  }

  private emitState(tid: string) {
    this.io.to(`lobby:${tid}`).emit("voice:state", { tid, speakers: this.speakersOf(tid), listeners: this.count(tid) })
  }

  private async allowedByName(tid: string, playerId: string) {
    const { rows } = await pool.query("select 1 from play.lobby_voice_allow where tournament_id = $1 and player_id = $2", [tid, playerId])
    return rows.length > 0
  }

  // Take someone's mic away (they keep listening).
  private async revoke(tid: string, identity: string) {
    const c = await this.config()
    this.speakers.get(tid)?.delete(identity)
    if (c.livekit)
      await this.api(c.livekit, "UpdateParticipant", { room: roomOf(tid), identity, permission: { canSubscribe: true, canPublish: false, canPublishData: false } }, roomOf(tid)).catch(() => {})
    this.io.to(`lobby:${tid}:u:${identity}`).emit("voice:mic", { tid, on: false })
    this.emitState(tid)
  }

  // Voice switched off for the lobby: everyone is sent out of the room.
  async closeRoom(tid: string) {
    const c = await this.config()
    this.speakers.delete(tid)
    this.listeners.delete(tid)
    this.rooms.delete(tid)
    if (c.livekit) await this.api(c.livekit, "DeleteRoom", { room: roomOf(tid) }, roomOf(tid)).catch(() => {})
    this.io.to(`lobby:${tid}`).emit("voice:closed", { tid })
  }

  register(socket: Socket, me: () => Player | null, limited: (s: Socket, ack?: unknown) => boolean) {
    const mine = new Set<string>()
    const leave = (tid: string) => {
      mine.delete(tid)
      const l = this.listeners.get(tid)?.get(socket.id)
      this.listeners.get(tid)?.delete(socket.id)
      if (l && this.speakers.get(tid)?.has(l.identity) && ![...(this.listeners.get(tid)?.values() ?? [])].some((x) => x.identity === l.identity)) this.speakers.get(tid)!.delete(l.identity)
      this.emitState(tid)
    }
    socket.on("disconnect", () => {
      for (const tid of [...mine]) leave(tid)
    })

    socket.on("voice:join", async (tid: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack) || typeof tid !== "string") return
      try {
        const role = this.lobbies.roleIn(tid, socket.id)
        if (!role) return ack({ ok: false, error: "not-in-lobby" })
        const c = await this.config()
        if (!c.enabled || !c.livekit) return ack({ ok: false, error: "voice-off-site" })
        const s = await this.lobbies.getSettings(tid)
        if (!s.voice_on) return ack({ ok: false, error: "voice-off" })
        if (!(await this.lobbies.lobbyOpen(tid))) return ack({ ok: false, error: "closed" })
        if (!mine.has(tid) && role !== "moderator") {
          if (this.count(tid) >= VOICE_LOBBY_LISTENERS) return ack({ ok: false, error: "lobby-full" })
          if (this.count() >= VOICE_SITE_LISTENERS) return ack({ ok: false, error: "site-full" })
        }
        const p = me()
        const identity = p?.id ?? `listener_${socket.id}`
        if (!this.rooms.has(tid)) {
          await this.api(c.livekit, "CreateRoom", { name: roomOf(tid), maxParticipants: VOICE_LOBBY_LISTENERS + 10, emptyTimeout: 300 }).catch((e) => console.warn("voice room:", (e as Error).message))
          this.rooms.add(tid)
        }
        if (!this.listeners.has(tid)) this.listeners.set(tid, new Map())
        this.listeners.get(tid)!.set(socket.id, { identity, role })
        mine.add(tid)
        const w = p ? await this.lobbies.who(tid, p) : null
        const talk = w ? canTalk(w, s, p ? await this.allowedByName(tid, p.id) : false) : "listen-only"
        const token = sign(
          c.livekit,
          {
            sub: identity,
            name: p?.name ?? "Listener",
            metadata: JSON.stringify({ role }),
            video: { room: roomOf(tid), roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false },
          },
          3 * 3600
        )
        this.emitState(tid)
        ack({ ok: true, url: c.livekit.url, token, identity, can_talk: talk === null, why: talk, speakers: this.speakersOf(tid), max_speakers: VOICE_SPEAKERS })
      } catch (e) {
        console.error("voice:join", e)
        ack({ ok: false, error: "server-error" })
      }
    })

    socket.on("voice:leave", (tid: unknown) => {
      if (typeof tid === "string" && mine.has(tid)) leave(tid)
    })

    // Take or give back the mic.
    socket.on("voice:mic", async (input: { tid?: unknown; on?: unknown }, ack: unknown) => {
      const reply = typeof ack === "function" ? (ack as (r: Record<string, unknown>) => void) : () => {}
      if (limited(socket, ack)) return
      const tid = input?.tid
      const p = me()
      if (typeof tid !== "string" || !mine.has(tid) || !p) return reply({ ok: false, error: "bad-request" })
      try {
        const c = await this.config()
        if (!c.livekit) return reply({ ok: false, error: "voice-off-site" })
        if (input.on !== true) {
          await this.revoke(tid, p.id)
          return reply({ ok: true })
        }
        const [w, s] = await Promise.all([this.lobbies.who(tid, p), this.lobbies.getSettings(tid)])
        const no = canTalk(w, s, await this.allowedByName(tid, p.id))
        if (no) return reply({ ok: false, error: no })
        if (!this.speakers.has(tid)) this.speakers.set(tid, new Map())
        const sp = this.speakers.get(tid)!
        if (!sp.has(p.id) && sp.size >= VOICE_SPEAKERS) return reply({ ok: false, error: "mics-full" })
        await this.api(c.livekit, "UpdateParticipant", { room: roomOf(tid), identity: p.id, permission: { canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: ["MICROPHONE"] } }, roomOf(tid))
        sp.set(p.id, { name: p.name, role: w.role })
        this.emitState(tid)
        reply({ ok: true })
      } catch (e) {
        console.error("voice:mic", e)
        reply({ ok: false, error: "not-connected" })
      }
    })

    // Moderator: voice on/off for the lobby, players may talk, a player allowed by name,
    // take someone's mic.
    socket.on("voice:mod", async (input: Record<string, unknown>, ack: unknown) => {
      const reply = typeof ack === "function" ? (ack as (r: Record<string, unknown>) => void) : () => {}
      if (limited(socket, ack)) return
      const tid = input?.tid
      const p = me()
      if (typeof tid !== "string" || !p || this.lobbies.roleIn(tid, socket.id) == null) return reply({ ok: false, error: "bad-request" })
      try {
        const w = await this.lobbies.who(tid, p)
        if (w.role !== "moderator") return reply({ ok: false, error: "moderators-only" })
        const s = await this.lobbies.getSettings(tid)
        switch (input.action) {
          case "voice": {
            if (input.on === true && !(await this.siteOn())) return reply({ ok: false, error: "voice-off-site" })
            await this.lobbies.saveSettings(tid, { ...s, voice_on: input.on === true }, p.id)
            if (input.on !== true) await this.closeRoom(tid)
            return reply({ ok: true })
          }
          case "players": {
            await this.lobbies.saveSettings(tid, { ...s, players_voice: input.on === true }, p.id)
            if (input.on !== true)
              for (const [id, sp] of this.speakers.get(tid) ?? []) if (sp.role === "player" && !(await this.allowedByName(tid, id))) await this.revoke(tid, id)
            this.io.to(`lobby:${tid}`).emit("voice:recheck", { tid })
            return reply({ ok: true })
          }
          case "allow": {
            const pid = input.player_id
            if (typeof pid !== "string" || !pid.startsWith("cus_")) return reply({ ok: false, error: "bad-request" })
            if (input.on === true) await pool.query("insert into play.lobby_voice_allow (tournament_id, player_id, by) values ($1,$2,$3) on conflict do nothing", [tid, pid, p.id])
            else {
              await pool.query("delete from play.lobby_voice_allow where tournament_id = $1 and player_id = $2", [tid, pid])
              const target = await this.lobbies.who(tid, { id: pid, name: "" })
              if (this.speakers.get(tid)?.has(pid) && canTalk(target, s, false)) await this.revoke(tid, pid)
            }
            this.io.to(`lobby:${tid}:u:${pid}`).emit("voice:recheck", { tid })
            return reply({ ok: true })
          }
          case "mute": {
            const pid = input.player_id
            if (typeof pid !== "string") return reply({ ok: false, error: "bad-request" })
            await this.revoke(tid, pid)
            return reply({ ok: true })
          }
          default:
            return reply({ ok: false, error: "bad-request" })
        }
      } catch (e) {
        console.error("voice:mod", e)
        reply({ ok: false, error: "server-error" })
      }
    })

    // Who in the lobby may be given the mic by name (moderators' list).
    socket.on("voice:allowed", async (tid: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack) || typeof tid !== "string") return
      const p = me()
      if (!p || this.lobbies.roleIn(tid, socket.id) !== "moderator") return ack({ ok: false })
      const { rows } = await pool.query("select player_id from play.lobby_voice_allow where tournament_id = $1", [tid])
      ack({ ok: true, ids: rows.map((r) => r.player_id) })
    })
  }
}
