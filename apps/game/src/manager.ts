import crypto from "node:crypto"
import { loadGame, loadLiveGames, saveGame } from "./db.js"
import { type Color, Game, type GameRecord, parseTimeControl, type Player } from "./game.js"

type View = ReturnType<Game["view"]>
type Listener = (game: Game) => void | Promise<void>

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const newGameId = () => Array.from(crypto.randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("")

// Waiting challenges that nobody accepts are withdrawn after a day.
const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000

// Keeps live games in memory, saves every change, and fires each game's next deadline
// (a flag fall or a missed first move) on time.
export class GameManager {
  private games = new Map<string, Game>()
  private timers = new Map<string, NodeJS.Timeout>()
  private onEnd: Listener[] = []

  constructor(private publish: (view: View) => void) {}

  whenGameEnds(fn: Listener) {
    this.onEnd.push(fn)
  }

  async restore() {
    const now = Date.now()
    for (const rec of await loadLiveGames()) {
      const g = new Game(rec)
      this.games.set(g.r.id, g)
      if (g.r.status === "waiting" && now - g.r.created_at > CHALLENGE_TTL_MS) {
        g.abort(g.r.creator_id, now)
        await this.changed(g)
      } else if (g.tick(now)) {
        await this.changed(g)
      } else {
        this.schedule(g)
      }
    }
    return this.games.size
  }

  async get(id: string): Promise<Game | null> {
    const live = this.games.get(id)
    if (live) return live
    const rec = await loadGame(id)
    if (!rec) return null
    const g = new Game(rec)
    // Finished games aren't kept in memory; live ones are.
    if (g.r.status === "waiting" || g.r.status === "active") this.games.set(id, g)
    return g
  }

  private schedule(g: Game) {
    clearTimeout(this.timers.get(g.r.id))
    this.timers.delete(g.r.id)
    const due = g.deadline()
    if (due == null) return
    const t = setTimeout(async () => {
      this.timers.delete(g.r.id)
      if (g.tick(Date.now())) await this.changed(g)
      else this.schedule(g)
    }, Math.max(0, due - Date.now()) + 25)
    t.unref?.()
    this.timers.set(g.r.id, t)
  }

  // Save, tell everyone watching, and handle the end of a game.
  private async changed(g: Game) {
    const over = g.r.status === "finished" || g.r.status === "aborted"
    await saveGame(g.r, over ? g.pgn() : null)
    this.publish(g.view(Date.now()))
    if (over) {
      clearTimeout(this.timers.get(g.r.id))
      this.timers.delete(g.r.id)
      this.games.delete(g.r.id)
      for (const fn of this.onEnd) {
        try {
          await fn(g)
        } catch (e) {
          console.error("game end listener failed", e)
        }
      }
    } else {
      this.schedule(g)
    }
  }

  // A friend challenge: the creator takes a colour, the first person to open the link plays.
  async createChallenge(creator: Player, tc: string, colour: Color | "random") {
    const parsed = parseTimeControl(tc)
    if (!parsed) throw new Error("bad-time-control")
    const side: Color = colour === "random" ? (crypto.randomInt(2) ? "w" : "b") : colour
    const rec: GameRecord = {
      id: newGameId(),
      mode: "friend",
      tournament_id: null,
      white: side === "w" ? creator : null,
      black: side === "b" ? creator : null,
      creator_id: creator.id,
      ...parsed,
      status: "waiting",
      result: null,
      reason: null,
      moves: [],
      white_ms: parsed.initial_ms,
      black_ms: parsed.initial_ms,
      turn_started_at: null,
      draw_offer: null,
      created_at: Date.now(),
      started_at: null,
      ended_at: null,
    }
    const g = new Game(rec)
    this.games.set(g.r.id, g)
    await this.changed(g)
    return g
  }

  // Two players paired by a tournament: the game starts straight away.
  async createPaired(white: Player, black: Player, initial_ms: number, increment_ms: number, tournamentId: string) {
    const now = Date.now()
    const g = new Game({
      id: newGameId(),
      mode: "arena",
      tournament_id: tournamentId,
      white,
      black,
      creator_id: white.id,
      initial_ms,
      increment_ms,
      status: "waiting",
      result: null,
      reason: null,
      moves: [],
      white_ms: initial_ms,
      black_ms: initial_ms,
      turn_started_at: null,
      draw_offer: null,
      created_at: now,
      started_at: null,
      ended_at: null,
    })
    g.start(now)
    this.games.set(g.r.id, g)
    await this.changed(g)
    return g
  }

  async accept(id: string, player: Player) {
    const g = await this.get(id)
    if (!g || g.r.status !== "waiting" || g.r.mode !== "friend") return { ok: false as const, error: "not-open" }
    if (g.r.creator_id === player.id) return { ok: false as const, error: "own-challenge" }
    if (!g.r.white) g.r.white = player
    else if (!g.r.black) g.r.black = player
    g.start(Date.now())
    await this.changed(g)
    return { ok: true as const, game: g }
  }

  async act(id: string, run: (g: Game, now: number) => boolean | { ok: boolean }) {
    const g = await this.get(id)
    if (!g) return { ok: false, error: "not-found" }
    const before = g.r.status
    const res = run(g, Date.now())
    const ok = typeof res === "boolean" ? res : res.ok
    // Also save when a refused action found the time already up (the game ended on it).
    if (ok || g.r.status !== before) await this.changed(g)
    return typeof res === "boolean" ? { ok } : res
  }

  liveCount() {
    return [...this.games.values()].filter((g) => g.r.status === "active").length
  }
}
