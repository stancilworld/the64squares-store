import { Chess } from "chess.js"
import pg from "pg"
import type { Server, Socket } from "socket.io"
import { config } from "./config.js"
import { pool } from "./db.js"
import type { Player } from "./game.js"
import type { GameManager } from "./manager.js"
import { clockText, DELAY_MS, type Facts, fallbackLine, lowTimeKey, materialOf, type Moment, type MoveInfo, momentsOf, openingOf, PIECE, type PieceKey, shouldSpeak } from "./commentary-rules.js"

// Live commentary, with no person involved. Staff switch it on for a game or a whole
// tournament in the admin (play.commentary; scope "site", "tourney:<id>" or "game:<id>").
// For each commentated game this server follows the moves and picks what's worth saying:
// only what happened (captures, trades, checks, castling, promotions, the clocks, the
// material count, the opening's name, the result). No engine and no judgement of moves,
// so nothing said can help a player. The backend writes the line with the AI keys and,
// for featured games, voices it; if it can't, a plain line is used.
//
// Spectators get the moves and the lines DELAY_MS late, on their own delayed board, so the
// commentary can't help anyone still playing; the two players can't open it at all.

type View = ReturnType<import("./game.js").Game["view"]>
type Setting = { enabled: boolean; voice: boolean }
type Item =
  | { kind: "move"; release: number; ply: number; san: string; fen: string; from: string; to: string; clocks: { w: number; b: number } }
  | { kind: "line"; release: number; id: string; ply: number; moment: Moment; text: string; audio_url: string | null }
  | { kind: "end"; release: number; result: string | null; reason: string | null }

type G = {
  id: string
  white: { id: string; name: string; rating: number | null }
  black: { id: string; name: string; rating: number | null }
  tc: string
  initialMs: number
  tournamentId: string | null
  tournament: string | null
  chess: Chess
  ply: number
  prev: MoveInfo | null
  lastLineAt: number
  lastLinePly: number
  said: Set<string>
  queue: Item[]
  shown: { moves: Extract<Item, { kind: "move" }>[]; lines: Extract<Item, { kind: "line" }>[]; end: Extract<Item, { kind: "end" }> | null }
  chain: Promise<void>
  over: boolean
  clocks: { w: number; b: number }
}

const MAX_GAMES = 12

export const migrateCommentary = async () => {
  await pool.query(`
    create table if not exists play.commentary (
      scope text primary key,
      enabled boolean not null default false,
      voice boolean not null default false,
      updated_by text,
      updated_at timestamptz not null default now()
    );
    insert into play.commentary (scope, enabled, voice) values ('site', true, true) on conflict do nothing;
  `)
}

let seq = 0

export class Commentary {
  private settings = new Map<string, Setting>()
  private games = new Map<string, G>()

  constructor(
    private io: Server,
    private manager: GameManager
  ) {
    setInterval(() => this.flush(), 400).unref()
  }

  async start() {
    await this.load()
    const client = new pg.Client({ connectionString: config.databaseUrl })
    client.on("error", (e) => {
      console.error("commentary listen", e)
      setTimeout(() => void this.start(), 5000).unref()
    })
    await client.connect()
    await client.query("listen commentary")
    client.on("notification", () => void this.load().then(() => this.sync()))
  }

  private async load() {
    const { rows } = await pool.query("select scope, enabled, voice from play.commentary")
    this.settings = new Map(rows.map((r) => [r.scope as string, { enabled: !!r.enabled, voice: !!r.voice }]))
  }

  // Is commentary on for this game, and with a voice?
  private settingFor(gameId: string, tournamentId: string | null): Setting {
    const site = this.settings.get("site") ?? { enabled: true, voice: true }
    if (!site.enabled) return { enabled: false, voice: false }
    const g = this.settings.get(`game:${gameId}`)
    const t = tournamentId ? this.settings.get(`tourney:${tournamentId}`) : undefined
    const enabled = g ? g.enabled : !!t?.enabled
    // A game's own setting wins over its tournament's; "featured" (voice) likewise.
    const voice = enabled && site.voice && (g ? g.voice : !!t?.voice)
    return { enabled, voice }
  }

  // Settings changed: pick up live games that were just switched on.
  private sync() {
    for (const g of this.manager.liveGames()) this.onState(g.view(Date.now()))
  }

  onState(v: View) {
    const s = this.settingFor(v.id, v.tournament_id ?? null)
    let g = this.games.get(v.id)
    if (!s.enabled) {
      if (g && !g.over) this.stop(g)
      return
    }
    if (!v.white || !v.black || v.mode === "computer") return
    if (!g) {
      if (v.status !== "active" || [...this.games.values()].filter((x) => !x.over).length >= MAX_GAMES) return
      g = this.begin(v)
    }
    // New moves (in order).
    const moves = v.moves as string[]
    while (g.ply < moves.length) {
      const san = moves[g.ply]
      let mv
      try {
        mv = g.chess.move(san)
      } catch {
        break
      }
      g.ply++
      const ply = g.ply
      const fen = g.chess.fen()
      const at = Date.now()
      const clocks = v.clocks as { w: number; b: number }
      g.clocks = clocks
      g.queue.push({ kind: "move", release: at + DELAY_MS, ply, san, fen, from: mv.from, to: mv.to, clocks })
      const info: MoveInfo = {
        ply,
        side: mv.color as "w" | "b",
        san,
        piece: mv.piece as PieceKey,
        captured: (mv.captured as PieceKey | undefined) ?? null,
        to: mv.to,
        promotion: (mv.promotion as PieceKey | undefined) ?? null,
        check: san.includes("+") || san.includes("#"),
        castle: san.startsWith("O-O-O") ? "queenside" : san.startsWith("O-O") ? "kingside" : null,
      }
      const history = g.chess.history()
      g.chain = g.chain.then(() => this.consider(g!, info, at, clocks, history))
    }
    if ((v.status === "finished" || v.status === "aborted") && !g.over) {
      g.over = true
      const end = { result: v.result ?? null, reason: v.reason ?? null }
      g.chain = g.chain.then(async () => {
        if (v.status === "finished") await this.say(g!, "end", g!.ply, Date.now(), end)
        g!.queue.push({ kind: "end", release: Date.now() + DELAY_MS, ...end })
        setTimeout(() => this.games.delete(g!.id), DELAY_MS + 10 * 60_000).unref()
      })
    }
  }

  private begin(v: View): G {
    const tc = v.initial_ms ? `${v.initial_ms / 60000}+${v.increment_ms / 1000}` : "untimed"
    const g: G = {
      id: v.id,
      white: { id: v.white!.id, name: v.white!.name, rating: v.white!.rating ?? null },
      black: { id: v.black!.id, name: v.black!.name, rating: v.black!.rating ?? null },
      tc,
      initialMs: v.initial_ms,
      tournamentId: v.tournament_id ?? null,
      tournament: null,
      chess: new Chess(),
      ply: 0,
      prev: null,
      lastLineAt: 0,
      lastLinePly: 0,
      said: new Set(),
      queue: [],
      shown: { moves: [], lines: [], end: null },
      chain: Promise.resolve(),
      over: false,
      clocks: v.clocks as { w: number; b: number },
    }
    // Switched on mid-game: catch up silently.
    const moves = v.moves as string[]
    if (moves.length) {
      for (const san of moves) {
        try {
          const mv = g.chess.move(san)
          g.ply++
          g.shown.moves.push({ kind: "move", release: 0, ply: g.ply, san, fen: g.chess.fen(), from: mv.from, to: mv.to, clocks: v.clocks as { w: number; b: number } })
        } catch {
          break
        }
      }
      g.said.add("start").add("opening")
      g.lastLinePly = g.ply
    }
    if (g.tournamentId)
      void pool
        .query("select title from public.tournament where id = $1", [g.tournamentId])
        .then((r) => (g.tournament = r.rows[0]?.title ?? null))
        .catch(() => {})
    this.games.set(v.id, g)
    this.io.emit("commentary:started", { game_id: v.id, tournament_id: g.tournamentId })
    return g
  }

  private stop(g: G) {
    g.over = true
    this.io.to(`commentary:${g.id}`).emit("commentary:off", { game_id: g.id })
    this.games.delete(g.id)
  }

  private async consider(g: G, m: MoveInfo, at: number, clocks: { w: number; b: number }, history: string[]) {
    if (g.over && !this.games.has(g.id)) return
    const prev = g.prev
    g.prev = m
    const leftMs = m.side === "w" ? clocks.w : clocks.b
    const moments = momentsOf(m, prev, { leftMs, initialMs: g.initialMs, said: g.said, opening: openingOf(history) })
    const moment = moments[0]
    if (!moment || !shouldSpeak(moment, at - g.lastLineAt, m.ply - g.lastLinePly)) return
    if (moment === "start" || moment === "opening") g.said.add(moment)
    if (moment === "low-time") g.said.add(lowTimeKey(leftMs, g.initialMs, m.side))
    await this.say(g, moment, m.ply, at, null, m, history, leftMs)
  }

  private async say(g: G, moment: Moment, ply: number, at: number, end: { result: string | null; reason: string | null } | null, m: MoveInfo | null = null, history?: string[], leftMs = 0) {
    g.lastLineAt = at
    g.lastLinePly = ply
    const s = this.settingFor(g.id, g.tournamentId)
    const moves = history ?? g.chess.history()
    const side = m?.side ?? "w"
    const mover = side === "w" ? g.white.name : g.black.name
    const opponent = side === "w" ? g.black.name : g.white.name
    const c = g.clocks
    const facts: Facts = {
      moment,
      white: g.white.name,
      black: g.black.name,
      white_rating: g.white.rating,
      black_rating: g.black.rating,
      time_control: g.tc,
      tournament: g.tournament,
      move_no: Math.ceil(ply / 2),
      mover,
      opponent,
      san: m?.san ?? "",
      piece: m ? PIECE[m.piece] : null,
      captured: m?.captured ? PIECE[m.captured] : null,
      square: m?.to ?? null,
      castle: m?.castle ?? null,
      promoted_to: m?.promotion ? PIECE[m.promotion] : null,
      check: !!m?.check,
      opening: openingOf(moves),
      material: materialOf(g.chess.fen(), g.white.name, g.black.name).text,
      clocks: { white: clockText(c.w), black: clockText(c.b) },
      mover_clock: clockText(side === "w" ? c.w : c.b),
      result: end?.result ?? null,
      reason: end?.reason ?? null,
    }
    const written = await this.write(facts, s.voice, leftMs)
    g.queue.push({ kind: "line", release: Math.max(at + DELAY_MS, Date.now()), id: `${g.id}-${ply}-${(seq++).toString(36)}`, ply, moment, text: written.text, audio_url: written.audio_url })
  }

  // The backend writes (and voices) the line; a plain line if it can't.
  private async write(f: Facts, voice: boolean, leftMs: number): Promise<{ text: string; audio_url: string | null }> {
    const plain = fallbackLine(f, leftMs)
    if (!config.internalSecret) return { text: plain, audio_url: null }
    try {
      const r = await fetch(`${config.backendUrl}/internal/commentary`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-t64-game-secret": config.internalSecret },
        body: JSON.stringify({ facts: f, fallback: plain, voice }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) throw new Error(`backend ${r.status}`)
      const d = (await r.json()) as { text?: string; audio_url?: string | null }
      return { text: (d.text || plain).slice(0, 400), audio_url: d.audio_url ?? null }
    } catch (e) {
      console.warn("commentary writer:", (e as Error).message)
      return { text: plain, audio_url: null }
    }
  }

  // Send what's due to the spectators.
  private flush() {
    const now = Date.now()
    for (const g of this.games.values()) {
      if (!g.queue.length) continue
      g.queue.sort((a, b) => a.release - b.release)
      while (g.queue.length && g.queue[0].release <= now) {
        const it = g.queue.shift()!
        if (it.kind === "move") g.shown.moves.push(it)
        else if (it.kind === "line") g.shown.lines = [...g.shown.lines, it].slice(-120)
        else g.shown.end = it
        this.io.to(`commentary:${g.id}`).emit("commentary:item", { game_id: g.id, ...it })
      }
    }
  }

  // Games with commentary now (for the lobby and the admin).
  list(tournamentId?: string) {
    return [...this.games.values()]
      .filter((g) => !g.over && (!tournamentId || g.tournamentId === tournamentId))
      .map((g) => ({ game_id: g.id, tournament_id: g.tournamentId, white: g.white, black: g.black, tc: g.tc, voice: this.settingFor(g.id, g.tournamentId).voice }))
  }

  register(socket: Socket, me: () => Player | null, limited: (s: Socket, ack?: unknown) => boolean) {
    socket.on("commentary:watch", (id: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack) || typeof id !== "string" || !/^[A-Za-z0-9]{6,20}$/.test(id)) return
      const g = this.games.get(id)
      if (!g) return ack({ ok: false, error: "off" })
      const p = me()
      // The players never get the commentary of their own game.
      if (p && (p.id === g.white.id || p.id === g.black.id)) return ack({ ok: false, error: "player" })
      socket.join(`commentary:${id}`)
      ack({
        ok: true,
        game_id: id,
        delay_ms: DELAY_MS,
        white: g.white,
        black: g.black,
        tc: g.tc,
        tournament: g.tournament,
        voice: this.settingFor(g.id, g.tournamentId).voice,
        moves: g.shown.moves,
        lines: g.shown.lines.slice(-60),
        end: g.shown.end,
        server_now: Date.now(),
      })
    })
    socket.on("commentary:unwatch", (id: unknown) => {
      if (typeof id === "string") socket.leave(`commentary:${id}`)
    })
    socket.on("commentary:list", (tid: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack)) return
      ack({ ok: true, games: this.list(typeof tid === "string" ? tid : undefined) })
    })
  }
}
