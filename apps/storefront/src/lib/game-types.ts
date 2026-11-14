export type Colour = "w" | "b"
export type GamePlayer = { id: string; name: string; rating?: number | null; diff?: number | null } | null

export type GameState = {
  id: string
  mode: "friend" | "arena" | "online" | "computer"
  rated: boolean
  tournament_id: string | null
  status: "waiting" | "active" | "finished" | "aborted"
  white: GamePlayer
  black: GamePlayer
  fen: string
  moves: string[]
  last_move: { from: string; to: string } | null
  turn: Colour
  in_check: boolean
  clocks: { w: number; b: number }
  clock_running: Colour | null
  first_move_deadline: number | null
  // Tournament games: both players press Ready before the game begins (until `until`).
  ready?: { w: boolean; b: boolean; until: number } | null
  initial_ms: number
  increment_ms: number
  result: "1-0" | "0-1" | "1/2-1/2" | null
  reason: string | null
  draw_offer: Colour | null
  server_now: number
}

// Where the game server is. Production builds point at the API address (deploy/build.sh).
export const GAME_URL = process.env.NEXT_PUBLIC_GAME_URL || "http://localhost:9200"

export const TIME_CONTROLS = [
  { tc: "1+0", label: "Bullet", detail: "1 min" },
  { tc: "2+1", label: "Bullet", detail: "2 | 1" },
  { tc: "3+0", label: "Blitz", detail: "3 min" },
  { tc: "3+2", label: "Blitz", detail: "3 | 2" },
  { tc: "5+0", label: "Blitz", detail: "5 min" },
  { tc: "5+3", label: "Blitz", detail: "5 | 3" },
  { tc: "10+0", label: "Rapid", detail: "10 min" },
  { tc: "10+5", label: "Rapid", detail: "10 | 5" },
  { tc: "15+10", label: "Rapid", detail: "15 | 10" },
  { tc: "30+0", label: "Classical", detail: "30 min" },
  { tc: "30+20", label: "Classical", detail: "30 | 20" },
] as const

const REASONS: Record<string, string> = {
  checkmate: "by checkmate",
  resign: "by resignation",
  timeout: "on time",
  stalemate: "by stalemate",
  insufficient: "by insufficient material",
  threefold: "by threefold repetition",
  "fifty-moves": "by the fifty-move rule",
  agreement: "by agreement",
  abandoned: "— opponent left the game",
  "no-show": "— the opponent wasn't ready in time",
  "no-shows": "— neither player was ready in time",
}

export type Presence = {
  id: string
  // signal: connection bars 0–4 (0 when offline).
  w: { online: boolean; gone_ms: number | null; signal?: number }
  b: { online: boolean; gone_ms: number | null; signal?: number }
  claim_after_ms: number
}

export type Speed = "bullet" | "blitz" | "rapid" | "classical"
export const speedOf = (initial_ms: number, increment_ms: number): Speed => {
  const est = (initial_ms + 40 * increment_ms) / 1000
  if (est < 180) return "bullet"
  if (est < 480) return "blitz"
  if (est < 1500) return "rapid"
  return "classical"
}
export const SPEED_LABEL: Record<Speed, string> = { bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", classical: "Classical" }
export const tcText = (initial_ms: number, increment_ms: number) => (initial_ms ? `${initial_ms / 60000}+${increment_ms / 1000}` : "No clock")

// The game a player is in, remembered in this browser so we can bring them back to it.
export const LIVE_KEY = "t64:live-game"

export const resultText = (g: Pick<GameState, "status" | "result" | "reason" | "white" | "black">) => {
  if (g.status === "aborted") return g.reason === "no-shows" ? "Game not played: neither player was ready in time." : g.reason === "no-start" ? "Game not played: nobody was ready (or the first move wasn't played) in time." : "Game aborted."
  if (!g.result) return ""
  const how = g.reason ? REASONS[g.reason] ?? "" : ""
  if (g.result === "1/2-1/2") return g.reason === "abandoned" ? "Draw — a player left the game" : `Draw ${how}`.trim()
  const winner = g.result === "1-0" ? g.white?.name ?? "White" : g.black?.name ?? "Black"
  return `${winner} wins ${how}`.trim()
}
