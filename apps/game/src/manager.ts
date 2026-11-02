import crypto from "node:crypto"
import { Chess } from "chess.js"
import { getRating, loadGame, loadLiveGames, saveGame, saveRating } from "./db.js"
import { type Color, Game, type GameRecord, isGuest, type Mode, parseTimeControl, type Player, type Reason, type Result } from "./game.js"
import { speedOf, update } from "./glicko.js"

type View = ReturnType<Game["view"]>
type Listener = (game: Game) => void | Promise<void>

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const newGameId = () => Array.from(crypto.randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("")

const blank = (fields: Pick<GameRecord, "mode" | "white" | "black" | "creator_id" | "initial_ms" | "increment_ms"> & Partial<GameRecord>): GameRecord => ({
  id: newGameId(),
  tournament_id: null,
  status: "waiting",
  result: null,
  reason: null,
  moves: [],
  white_ms: fields.initial_ms,
  black_ms: fields.initial_ms,
  turn_started_at: null,
  draw_offer: null,
  created_at: Date.now(),
  started_at: null,
  ended_at: null,
  rated: false,
  white_rating: null,
  black_rating: null,
  white_diff: null,
  black_diff: null,
  ...fields,
})

export const COMPUTER_ID = "computer"

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

  // Applies a rated game's result to both players' ratings and keeps the change on the game.
  private async rate(g: Game) {
    const { white, black, result } = g.r
    if (!g.r.rated || !white || !black || !result || g.r.white_diff != null) return
    const speed = speedOf(g.r.initial_ms, g.r.increment_ms)
    const [w, b] = await Promise.all([getRating(white.id, speed), getRating(black.id, speed)])
    const sw = result === "1-0" ? 1 : result === "0-1" ? 0 : 0.5
    const nw = update(w, b, sw)
    const nb = update(b, w, 1 - sw)
    g.r.white_rating ??= Math.round(w.rating)
    g.r.black_rating ??= Math.round(b.rating)
    g.r.white_diff = Math.round(nw.rating) - Math.round(w.rating)
    g.r.black_diff = Math.round(nb.rating) - Math.round(b.rating)
    await Promise.all([saveRating(white.id, speed, white.name, nw, sw), saveRating(black.id, speed, black.name, nb, 1 - sw)])
  }

  // Save, tell everyone watching, and handle the end of a game.
  private async changed(g: Game) {
    const over = g.r.status === "finished" || g.r.status === "aborted"
    if (g.r.status === "finished") {
      try {
        await this.rate(g)
      } catch (e) {
        console.error("rating update failed", e)
      }
    }
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
    const g = new Game(
      blank({ mode: "friend", white: side === "w" ? creator : null, black: side === "b" ? creator : null, creator_id: creator.id, ...parsed })
    )
    this.games.set(g.r.id, g)
    await this.changed(g)
    return g
  }

  // Two players paired by the server (an arena, or "Play online"): rated, starts straight away.
  async createPaired(
    white: Player,
    black: Player,
    initial_ms: number,
    increment_ms: number,
    opts: { mode: Mode; tournamentId?: string | null; rated?: boolean }
  ) {
    const now = Date.now()
    // A game with a guest in it never counts for ratings.
    const rated = (opts.rated ?? true) && !isGuest(white.id) && !isGuest(black.id)
    const speed = speedOf(initial_ms, increment_ms)
    const [wr, br] = await Promise.all([getRating(white.id, speed), getRating(black.id, speed)])
    const g = new Game(
      blank({
        mode: opts.mode,
        tournament_id: opts.tournamentId ?? null,
        white,
        black,
        creator_id: white.id,
        initial_ms,
        increment_ms,
        rated,
        white_rating: rated ? Math.round(wr.rating) : null,
        black_rating: rated ? Math.round(br.rating) : null,
      })
    )
    g.start(now)
    this.games.set(g.r.id, g)
    await this.changed(g)
    return g
  }

  // A finished game against the computer (played in the browser), kept in the player's history.
  // The moves are replayed here, so only a real finished game (or a resignation) is accepted.
  async saveComputerGame(player: Player, colour: Color, level: number, uci: string[], resigned: boolean) {
    if (!Array.isArray(uci) || uci.length < 2 || uci.length > 1200) return { ok: false as const, error: "bad-game" }
    const chess = new Chess()
    const san: string[] = []
    for (const m of uci) {
      const p = typeof m === "string" ? /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(m) : null
      if (!p || chess.isGameOver()) return { ok: false as const, error: "bad-game" }
      try {
        san.push(chess.move({ from: p[1], to: p[2], promotion: p[3] }).san)
      } catch {
        return { ok: false as const, error: "bad-game" }
      }
    }
    let result: Result
    let reason: Reason
    if (chess.isCheckmate()) {
      result = chess.turn() === "w" ? "0-1" : "1-0"
      reason = "checkmate"
    } else if (chess.isGameOver()) {
      result = "1/2-1/2"
      reason = chess.isStalemate() ? "stalemate" : chess.isInsufficientMaterial() ? "insufficient" : chess.isThreefoldRepetition() ? "threefold" : "fifty-moves"
    } else if (resigned) {
      result = colour === "w" ? "0-1" : "1-0"
      reason = "resign"
    } else return { ok: false as const, error: "not-over" }
    const bot: Player = { id: COMPUTER_ID, name: `Computer · Level ${Math.max(1, Math.min(8, Math.round(level)))}` }
    const now = Date.now()
    const g = new Game(
      blank({
        mode: "computer",
        white: colour === "w" ? player : bot,
        black: colour === "b" ? player : bot,
        creator_id: player.id,
        initial_ms: 0,
        increment_ms: 0,
        status: "finished",
        result,
        reason,
        moves: san,
        started_at: now,
        ended_at: now,
      })
    )
    await saveGame(g.r, g.pgn())
    return { ok: true as const, id: g.r.id }
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

  // Live games a player is in (from memory, so it is instant).
  liveFor(playerId: string) {
    return [...this.games.values()].filter((g) => g.r.status === "active" && g.colorOf(playerId)).map((g) => g.r.id)
  }

  liveCount() {
    return [...this.games.values()].filter((g) => g.r.status === "active").length
  }
}
