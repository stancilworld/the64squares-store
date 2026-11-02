import { Chess } from "chess.js"

// One game: the position, both clocks and the result. Pure logic with the time passed in,
// so it can be tested without waiting and restored after a restart.

export type Color = "w" | "b"
export type Status = "waiting" | "active" | "finished" | "aborted"
export type Result = "1-0" | "0-1" | "1/2-1/2"
export type Reason =
  | "checkmate"
  | "resign"
  | "timeout"
  | "stalemate"
  | "insufficient"
  | "threefold"
  | "fifty-moves"
  | "agreement"
  | "aborted"
  | "no-start"
  | "abandoned"

export type Player = { id: string; name: string }

export const isGuest = (id: string | null | undefined) => !!id && id.startsWith("guest_")

export type Mode = "friend" | "arena" | "online" | "computer"

export type GameRecord = {
  id: string
  mode: Mode
  tournament_id: string | null
  white: Player | null
  black: Player | null
  creator_id: string
  initial_ms: number
  increment_ms: number
  status: Status
  result: Result | null
  reason: Reason | null
  moves: string[] // SAN
  white_ms: number
  black_ms: number
  // When the side to move started thinking (null before the clocks start).
  turn_started_at: number | null
  draw_offer: Color | null
  created_at: number
  started_at: number | null
  ended_at: number | null
  // Rated games change both players' ratings; the change is stored when the game ends.
  rated: boolean
  white_rating: number | null
  black_rating: number | null
  white_diff: number | null
  black_diff: number | null
}

// Each side's first move doesn't use its clock, but must come within this time.
export const FIRST_MOVE_MS = 30_000

export const parseTimeControl = (tc: string) => {
  const m = /^(\d{1,3})\+(\d{1,3})$/.exec(tc.trim())
  if (!m) return null
  const minutes = Number(m[1])
  const increment = Number(m[2])
  if (minutes < 1 || minutes > 180 || increment > 180) return null
  return { initial_ms: minutes * 60_000, increment_ms: increment * 1000 }
}

export type MoveError = "not-your-turn" | "not-active" | "illegal" | "stale" | "not-a-player"

export class Game {
  readonly r: GameRecord
  private chess: Chess

  constructor(record: GameRecord) {
    this.r = record
    this.chess = new Chess()
    for (const san of record.moves) this.chess.move(san)
  }

  get ply() {
    return this.r.moves.length
  }
  get turn(): Color {
    return this.chess.turn()
  }
  get fen() {
    return this.chess.fen()
  }

  colorOf(playerId: string): Color | null {
    if (this.r.white?.id === playerId) return "w"
    if (this.r.black?.id === playerId) return "b"
    return null
  }

  // Clocks run once each side has made its first move.
  private clocksRunning() {
    return this.r.status === "active" && this.ply >= 2
  }

  // Remaining time for both sides at `now`, as shown to players.
  clocks(now: number) {
    let w = this.r.white_ms
    let b = this.r.black_ms
    if (this.clocksRunning() && this.r.turn_started_at != null) {
      const used = Math.max(0, now - this.r.turn_started_at)
      if (this.turn === "w") w -= used
      else b -= used
    }
    return { w: Math.max(0, w), b: Math.max(0, b) }
  }

  // The moment something must happen if nobody moves: a flag fall, or a missed first move.
  deadline(): number | null {
    if (this.r.status !== "active" || this.r.turn_started_at == null) return null
    if (this.ply < 2) return this.r.turn_started_at + FIRST_MOVE_MS
    const left = this.turn === "w" ? this.r.white_ms : this.r.black_ms
    return this.r.turn_started_at + left
  }

  start(now: number) {
    if (this.r.status !== "waiting" || !this.r.white || !this.r.black) return
    this.r.status = "active"
    this.r.started_at = now
    this.r.turn_started_at = now
  }

  private finish(result: Result | null, reason: Reason, now: number) {
    this.r.status = reason === "aborted" || reason === "no-start" ? "aborted" : "finished"
    this.r.result = result
    this.r.reason = reason
    this.r.ended_at = now
    this.r.draw_offer = null
    // Freeze the clock of the side that was thinking.
    if (this.clocksRunning() && this.r.turn_started_at != null) {
      const c = this.clocks(now)
      this.r.white_ms = c.w
      this.r.black_ms = c.b
    }
    this.r.turn_started_at = null
  }

  // Checks for a flag fall or a missed first move. Returns true when the game ended.
  tick(now: number): boolean {
    const due = this.deadline()
    if (due == null || now < due) return false
    if (this.ply < 2) {
      this.finish(null, "no-start", now)
      return true
    }
    const loser = this.turn
    // Flagging against a lone king (or too little to mate) is a draw.
    const winnerCanMate = this.canMate(loser === "w" ? "b" : "w")
    this.finish(winnerCanMate ? (loser === "w" ? "0-1" : "1-0") : "1/2-1/2", "timeout", now)
    if (loser === "w") this.r.white_ms = 0
    else this.r.black_ms = 0
    return true
  }

  private canMate(color: Color) {
    const pieces = this.chess
      .board()
      .flat()
      .filter((p): p is NonNullable<typeof p> => !!p && p.color === color && p.type !== "k")
    if (pieces.length === 0) return false
    if (pieces.length === 1 && (pieces[0].type === "b" || pieces[0].type === "n")) return false
    return true
  }

  move(playerId: string, uci: string, ply: number, now: number): { ok: true; san: string } | { ok: false; error: MoveError } {
    if (this.tick(now)) return { ok: false, error: "not-active" }
    if (this.r.status !== "active") return { ok: false, error: "not-active" }
    const color = this.colorOf(playerId)
    if (!color) return { ok: false, error: "not-a-player" }
    if (color !== this.turn) return { ok: false, error: "not-your-turn" }
    // The client says which ply it is moving from, so a double-click can't play twice.
    if (ply !== this.ply) return { ok: false, error: "stale" }
    const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci)
    if (!m) return { ok: false, error: "illegal" }
    let san: string
    try {
      san = this.chess.move({ from: m[1], to: m[2], promotion: m[3] ?? "q" }).san
    } catch {
      return { ok: false, error: "illegal" }
    }

    if (this.ply >= 2) {
      // Charge the mover for the time used, then add the increment.
      const used = Math.max(0, now - (this.r.turn_started_at ?? now))
      if (color === "w") this.r.white_ms = this.r.white_ms - used + this.r.increment_ms
      else this.r.black_ms = this.r.black_ms - used + this.r.increment_ms
    }
    this.r.moves.push(san)
    this.r.turn_started_at = now
    // A move declines a draw offer from the other side; an own offer stays open.
    if (this.r.draw_offer && this.r.draw_offer !== color) this.r.draw_offer = null

    if (this.chess.isCheckmate()) this.finish(color === "w" ? "1-0" : "0-1", "checkmate", now)
    else if (this.chess.isStalemate()) this.finish("1/2-1/2", "stalemate", now)
    else if (this.chess.isInsufficientMaterial()) this.finish("1/2-1/2", "insufficient", now)
    else if (this.chess.isThreefoldRepetition()) this.finish("1/2-1/2", "threefold", now)
    else if (this.chess.isDrawByFiftyMoves()) this.finish("1/2-1/2", "fifty-moves", now)
    return { ok: true, san }
  }

  resign(playerId: string, now: number) {
    if (this.tick(now) || this.r.status !== "active") return false
    const color = this.colorOf(playerId)
    if (!color) return false
    // Before both sides have moved, giving up just aborts the game.
    if (this.ply < 2) this.finish(null, "aborted", now)
    else this.finish(color === "w" ? "0-1" : "1-0", "resign", now)
    return true
  }

  abort(playerId: string, now: number) {
    const color = this.colorOf(playerId)
    if (this.r.status === "waiting" && playerId === this.r.creator_id) {
      this.finish(null, "aborted", now)
      return true
    }
    if (!color || this.r.status !== "active" || this.ply >= 2) return false
    this.finish(null, "aborted", now)
    return true
  }

  draw(playerId: string, action: "offer" | "accept" | "decline", now: number) {
    if (this.tick(now) || this.r.status !== "active" || this.ply < 2) return false
    const color = this.colorOf(playerId)
    if (!color) return false
    if (action === "offer") {
      if (this.r.draw_offer && this.r.draw_offer !== color) {
        this.finish("1/2-1/2", "agreement", now)
      } else {
        this.r.draw_offer = color
      }
      return true
    }
    if (!this.r.draw_offer || this.r.draw_offer === color) return false
    if (action === "accept") this.finish("1/2-1/2", "agreement", now)
    else this.r.draw_offer = null
    return true
  }

  // The other side left and didn't come back: the one still here takes the win (or a draw).
  claim(playerId: string, outcome: "win" | "draw", now: number) {
    if (this.tick(now) || this.r.status !== "active" || this.ply < 2) return false
    const color = this.colorOf(playerId)
    if (!color) return false
    if (outcome === "draw" || !this.canMate(color)) this.finish("1/2-1/2", "abandoned", now)
    else this.finish(color === "w" ? "1-0" : "0-1", "abandoned", now)
    return true
  }

  // What players and spectators see.
  view(now: number) {
    const history = this.chess.history({ verbose: true })
    const last = history[history.length - 1]
    return {
      id: this.r.id,
      mode: this.r.mode,
      tournament_id: this.r.tournament_id,
      status: this.r.status,
      white: this.r.white ? { ...this.r.white, rating: this.r.white_rating, diff: this.r.white_diff } : null,
      black: this.r.black ? { ...this.r.black, rating: this.r.black_rating, diff: this.r.black_diff } : null,
      rated: this.r.rated,
      fen: this.fen,
      moves: this.r.moves,
      last_move: last ? { from: last.from, to: last.to } : null,
      turn: this.turn,
      in_check: this.chess.inCheck(),
      clocks: this.clocks(now),
      clock_running: this.r.status === "active" && this.ply >= 2 ? this.turn : null,
      first_move_deadline: this.r.status === "active" && this.ply < 2 ? this.deadline() : null,
      initial_ms: this.r.initial_ms,
      increment_ms: this.r.increment_ms,
      result: this.r.result,
      reason: this.r.reason,
      draw_offer: this.r.draw_offer,
      server_now: now,
    }
  }

  pgn() {
    const date = new Date(this.r.started_at ?? this.r.created_at).toISOString().slice(0, 10).replace(/-/g, ".")
    const tags = [
      ["Event", this.r.mode === "arena" ? "The 64 Squares Arena" : this.r.mode === "computer" ? "Game vs computer" : this.r.rated ? "Rated game" : "Casual game"],
      ["Site", "the64squares.in"],
      ["Date", date],
      ["White", this.r.white?.name ?? "?"],
      ["Black", this.r.black?.name ?? "?"],
      ["Result", this.r.result ?? "*"],
      ["TimeControl", this.r.initial_ms ? `${this.r.initial_ms / 1000}+${this.r.increment_ms / 1000}` : "-"],
      ...(this.r.white_rating != null ? [["WhiteElo", String(this.r.white_rating)]] : []),
      ...(this.r.black_rating != null ? [["BlackElo", String(this.r.black_rating)]] : []),
      ...(this.r.reason ? [["Termination", this.r.reason]] : []),
    ]
    const body = this.r.moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ")
    return `${tags.map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join("\n")}\n\n${body} ${this.r.result ?? "*"}\n`
  }
}
