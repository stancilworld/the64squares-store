// Live commentary rules (pure; tested in commentary-rules.test.ts).
//
// The commentator only says what happened on the board: who took what, checks, castling,
// promotions, the clocks, the material count, the opening's name and the result. It never
// judges a move (no "blunder", "good", "winning") and never uses a chess engine, so
// nothing it says, even 25 seconds late, can tell anyone what the players should do.

export const DELAY_MS = 25_000

export type Moment = "start" | "opening" | "capture" | "trade" | "promotion" | "check" | "castle" | "low-time" | "milestone" | "end"

export type PieceKey = "p" | "n" | "b" | "r" | "q" | "k"
export const PIECE: Record<PieceKey, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }

// One move, as chess.js reports it.
export type MoveInfo = {
  ply: number
  side: "w" | "b"
  san: string
  piece: PieceKey
  captured: PieceKey | null
  to: string
  promotion: PieceKey | null
  check: boolean
  castle: "kingside" | "queenside" | null
}

// What the writer is told about one moment: facts only.
export type Facts = {
  moment: Moment
  white: string
  black: string
  white_rating: number | null
  black_rating: number | null
  time_control: string
  tournament: string | null
  move_no: number
  mover: string
  opponent: string
  san: string
  piece: string | null
  captured: string | null
  square: string | null
  castle: "kingside" | "queenside" | null
  promoted_to: string | null
  check: boolean
  opening: string | null
  material: string
  clocks: { white: string; black: string }
  mover_clock: string
  result?: string | null
  reason?: string | null
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

// The material count (a count of pieces, not an opinion).
export const materialOf = (fen: string, white = "White", black = "Black") => {
  let w = 0
  let b = 0
  for (const ch of fen.split(" ")[0]) {
    const v = VALUE[ch.toLowerCase()]
    if (!v) continue
    if (ch === ch.toUpperCase()) w += v
    else b += v
  }
  const d = Math.abs(w - b)
  return { w, b, text: d === 0 ? "Material level" : `${w > b ? white : black} +${d}` }
}

export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
const secondsWords = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  if (s < 60) return `${s} seconds`
  const m = Math.floor(s / 60)
  return `${m} minute${m === 1 ? "" : "s"}${s % 60 ? ` ${s % 60} seconds` : ""}`
}

// The commonest openings, by their first moves (longest match wins).
const OPENINGS: [string, string][] = [
  ["e4 e5 Nf3 Nc6 Bb5", "Ruy Lopez"],
  ["e4 e5 Nf3 Nc6 Bc4 Bc5", "Italian Game, Giuoco Piano"],
  ["e4 e5 Nf3 Nc6 Bc4 Nf6", "Two Knights Defence"],
  ["e4 e5 Nf3 Nc6 Bc4", "Italian Game"],
  ["e4 e5 Nf3 Nc6 d4", "Scotch Game"],
  ["e4 e5 Nf3 Nc6 Nc3 Nf6", "Four Knights Game"],
  ["e4 e5 Nf3 Nf6", "Petrov Defence"],
  ["e4 e5 Nf3 d6", "Philidor Defence"],
  ["e4 e5 f4", "King's Gambit"],
  ["e4 e5 Nc3", "Vienna Game"],
  ["e4 e5 Bc4", "Bishop's Opening"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "Sicilian Najdorf"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6", "Sicilian Dragon"],
  ["e4 c5 Nf3 Nc6", "Sicilian Defence"],
  ["e4 c5 Nf3 e6", "Sicilian Defence"],
  ["e4 c5 Nc3", "Closed Sicilian"],
  ["e4 c5 c3", "Alapin Sicilian"],
  ["e4 c5", "Sicilian Defence"],
  ["e4 e6 d4 d5", "French Defence"],
  ["e4 e6", "French Defence"],
  ["e4 c6 d4 d5", "Caro-Kann Defence"],
  ["e4 c6", "Caro-Kann Defence"],
  ["e4 d5", "Scandinavian Defence"],
  ["e4 Nf6", "Alekhine Defence"],
  ["e4 d6 d4 Nf6", "Pirc Defence"],
  ["e4 g6", "Modern Defence"],
  ["d4 d5 c4 e6", "Queen's Gambit Declined"],
  ["d4 d5 c4 dxc4", "Queen's Gambit Accepted"],
  ["d4 d5 c4 c6", "Slav Defence"],
  ["d4 d5 c4", "Queen's Gambit"],
  ["d4 d5 Bf4", "London System"],
  ["d4 Nf6 Bf4", "London System"],
  ["d4 d5 Nf3 Nf6 Bf4", "London System"],
  ["d4 Nf6 c4 g6 Nc3 Bg7", "King's Indian Defence"],
  ["d4 Nf6 c4 g6 Nc3 d5", "Grünfeld Defence"],
  ["d4 Nf6 c4 e6 Nc3 Bb4", "Nimzo-Indian Defence"],
  ["d4 Nf6 c4 e6 Nf3 b6", "Queen's Indian Defence"],
  ["d4 Nf6 c4 c5", "Benoni Defence"],
  ["d4 f5", "Dutch Defence"],
  ["d4 Nf6", "Indian Defence"],
  ["d4 d5", "Queen's Pawn Game"],
  ["c4", "English Opening"],
  ["Nf3", "Réti Opening"],
  ["g3", "King's Fianchetto"],
  ["b3", "Larsen's Opening"],
  ["f4", "Bird's Opening"],
]
export const openingOf = (moves: string[]) => {
  const line = moves.slice(0, 12).join(" ")
  let best: string | null = null
  let len = 0
  for (const [seq, name] of OPENINGS) if ((line === seq || line.startsWith(`${seq} `)) && seq.length > len) [best, len] = [name, seq.length]
  return best
}

// Higher wins when several things happen in one move, and decides how soon after the last
// line the commentator may speak again.
export const PRIORITY: Record<Moment, number> = {
  end: 10,
  start: 9,
  promotion: 8,
  // A recapture is always said, so the material count just announced is never left wrong.
  trade: 8,
  capture: 6,
  "low-time": 6,
  opening: 4,
  check: 3,
  castle: 2,
  milestone: 1,
}

// The low-time warnings: below a minute (a quarter of the start time in 1-minute games), then
// below 10 seconds; once each per player.
export const lowTimeMark = (leftMs: number, initialMs: number): "low" | "very-low" | null => {
  if (!initialMs) return null
  if (leftMs < 10_000) return "very-low"
  if (leftMs < (initialMs <= 60_000 ? initialMs * 0.25 : 60_000)) return "low"
  return null
}

// The things worth a line in this move (most important first).
export const momentsOf = (m: MoveInfo, prev: MoveInfo | null, o: { leftMs: number; initialMs: number; said: Set<string>; opening: string | null }): Moment[] => {
  const out: Moment[] = []
  if (m.ply === 1 && !o.said.has("start")) out.push("start")
  if (m.promotion) out.push("promotion")
  // A piece (not a pawn) taken back on the same square at once is a trade.
  if (m.captured && m.captured !== "p" && prev?.captured && prev.to === m.to) out.push("trade")
  else if (m.captured && m.captured !== "p") out.push("capture")
  const mark = lowTimeMark(o.leftMs, o.initialMs)
  if (mark && !o.said.has(`${mark}-${m.side}`)) out.push("low-time")
  if (o.opening && m.ply >= 6 && m.ply <= 16 && !o.said.has("opening")) out.push("opening")
  if (m.check) out.push("check")
  if (m.castle) out.push("castle")
  if (m.ply % 20 === 0) out.push("milestone")
  return out.sort((a, b) => PRIORITY[b] - PRIORITY[a])
}

export const shouldSpeak = (m: Moment, sinceLastMs: number, pliesSinceLast: number) => {
  if (PRIORITY[m] >= 8) return true
  if (PRIORITY[m] >= 5) return sinceLastMs >= 5_000
  if (PRIORITY[m] >= 2) return sinceLastMs >= 12_000
  return sinceLastMs >= 25_000 && pliesSinceLast >= 8
}

export const lowTimeKey = (leftMs: number, initialMs: number, side: "w" | "b") => `${lowTimeMark(leftMs, initialMs)}-${side}`

// "Pradyuman Singh Rajawat" → "Pradyuman": lines stay short.
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

// A plain line, for when the AI writer isn't connected or its line isn't safe to use. Short on
// purpose: a few words, said while the game goes on.
export const fallbackLine = (f: Facts, leftMs = 0) => {
  switch (f.moment) {
    case "start":
      return `${f.white}${f.white_rating ? ` (${f.white_rating})` : ""} vs ${f.black}${f.black_rating ? ` (${f.black_rating})` : ""}, ${f.time_control}.`
    case "opening":
      return `${f.opening} on the board.`
    case "capture":
      return `${f.mover} takes the ${f.captured} on ${f.square}${f.check ? ", check" : ""}. ${f.material}.`
    case "trade":
      return `Trade on ${f.square}${f.check ? ", check" : ""}. ${f.material}.`
    case "promotion":
      return `${f.mover} promotes to a ${f.promoted_to}!`
    case "check":
      return `Check from ${f.mover}.`
    case "castle":
      return `${f.mover} castles ${f.castle === "queenside" ? "long" : "short"}.`
    case "low-time":
      return `${f.mover}: ${leftMs ? secondsWords(leftMs) : f.mover_clock} left!`
    case "milestone":
      return `Move ${f.move_no}. ${f.material}. Clocks ${f.clocks.white} and ${f.clocks.black}.`
    case "end":
      return f.result === "1/2-1/2" ? `Draw${f.reason ? ` by ${f.reason.replace(/-/g, " ")}` : ""}. Well played!` : `${f.result === "1-0" ? f.white : f.black} wins${f.reason ? ` by ${f.reason.replace(/-/g, " ")}` : ""}!`
  }
}
