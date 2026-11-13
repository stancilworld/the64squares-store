// Live commentary rules (pure; tested in commentary-rules.test.ts): what a move was, what's
// worth saying about it, and a plain line to say when the AI writer isn't available.
// Nothing here ever names a better move: spectators hear it 25 seconds late, but the game
// is still being played.

export const DELAY_MS = 25_000

export type Moment =
  | "start"
  | "opening"
  | "blunder"
  | "mistake"
  | "turnaround"
  | "check"
  | "big-capture"
  | "promotion"
  | "castle"
  | "time-trouble"
  | "decisive"
  | "quiet"
  | "end"

// What the writer is told about one moment (facts only, no best moves).
export type Facts = {
  moment: Moment
  white: string
  black: string
  white_rating: number | null
  black_rating: number | null
  time_control: string
  tournament: string | null
  move_no: number
  side: "White" | "Black"
  mover: string
  san: string
  recent: string[]
  opening: string | null
  eval_white: number | null
  material: string
  clocks: { white_s: number; black_s: number }
  result?: string | null
  reason?: string | null
  featured: boolean
}

// How much a move lost, from the mover's side, in centipawns (evals are for White).
export const lossOf = (side: "w" | "b", before: number, after: number) => (side === "w" ? before - after : after - before)

export const classify = (loss: number, before: number, after: number, side: "w" | "b"): Moment | null => {
  const mine = (x: number) => (side === "w" ? x : -x)
  // Already lost or already winning by a mile: small slips don't matter.
  if (Math.abs(before) >= 900 && Math.abs(after) >= 900 && Math.sign(before) === Math.sign(after)) return null
  if (mine(before) > -150 && mine(after) < -150 && loss >= 250) return "turnaround"
  if (loss >= 300) return "blunder"
  if (loss >= 150) return "mistake"
  return null
}

// White's advantage in words.
export const evalWords = (cp: number | null, white: string, black: string) => {
  if (cp == null) return "unclear"
  const who = cp > 0 ? white : black
  const a = Math.abs(cp)
  if (a >= 900) return `${who} is winning`
  if (a >= 300) return `${who} is clearly better`
  if (a >= 120) return `${who} is a little better`
  return "roughly level"
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
export const materialOf = (fen: string) => {
  const board = fen.split(" ")[0]
  let w = 0
  let b = 0
  for (const ch of board) {
    const v = VALUE[ch.toLowerCase()]
    if (!v) continue
    if (ch === ch.toUpperCase()) w += v
    else b += v
  }
  return { w, b, text: w === b ? "material is level" : `${w > b ? "White" : "Black"} is up ${Math.abs(w - b)} point${Math.abs(w - b) === 1 ? "" : "s"} of material` }
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
  ["e4 e5 Qh5", "an early queen attack"],
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

// Is this moment worth a line? Priority (higher wins when lines queue up) and a minimum
// gap since the last line, so the commentator talks about once every 10-20 seconds.
export const PRIORITY: Record<Moment, number> = {
  end: 10,
  start: 9,
  turnaround: 8,
  blunder: 8,
  decisive: 7,
  mistake: 6,
  "time-trouble": 6,
  promotion: 5,
  "big-capture": 4,
  opening: 4,
  check: 2,
  castle: 1,
  quiet: 0,
}
export const shouldSpeak = (m: Moment, sinceLastMs: number, pliesSinceLast: number) => {
  if (PRIORITY[m] >= 8) return true
  if (PRIORITY[m] >= 5) return sinceLastMs >= 6_000
  if (PRIORITY[m] >= 2) return sinceLastMs >= 14_000
  return sinceLastMs >= 25_000 && pliesSinceLast >= 8
}

const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} minute${s >= 120 ? "s" : ""}` : `${Math.max(0, Math.round(s))} seconds`)

// A plain line for when the AI writer isn't connected or doesn't answer.
export const fallbackLine = (f: Facts) => {
  const state = evalWords(f.eval_white, f.white, f.black)
  switch (f.moment) {
    case "start":
      return `${f.white}${f.white_rating ? ` (${f.white_rating})` : ""} with White against ${f.black}${f.black_rating ? ` (${f.black_rating})` : ""}, ${f.time_control}${f.tournament ? ` in the ${f.tournament}` : ""}. Let's see how this one goes.`
    case "opening":
      return `We're in the ${f.opening}. Both players know this ground.`
    case "blunder":
      return `${f.san} from ${f.mover}... that's a serious slip. Now ${state}.`
    case "turnaround":
      return `What a turn! After ${f.san}, ${state}.`
    case "mistake":
      return `${f.mover} plays ${f.san}, and that gives something away. ${state[0].toUpperCase()}${state.slice(1)}.`
    case "decisive":
      return `${state[0].toUpperCase()}${state.slice(1)} now, and ${f.material}.`
    case "time-trouble": {
      const left = f.side === "White" ? f.clocks.white_s : f.clocks.black_s
      return `${f.mover} is down to ${secs(left)} on the clock. Every second counts now.`
    }
    case "promotion":
      return `${f.mover} promotes with ${f.san}!`
    case "big-capture":
      return `${f.san}, a big capture by ${f.mover}. ${f.material[0].toUpperCase()}${f.material.slice(1)}.`
    case "check":
      return `${f.san}, check from ${f.mover}.`
    case "castle":
      return `${f.mover} castles to safety.`
    case "end":
      return `And that's the game: ${f.result === "1/2-1/2" ? "a draw" : `${f.result === "1-0" ? f.white : f.black} wins`}${f.reason ? ` by ${f.reason.replace(/-/g, " ")}` : ""}. Well played, both.`
    default:
      return `Move ${f.move_no}. ${state[0].toUpperCase()}${state.slice(1)}, and ${f.material}.`
  }
}
