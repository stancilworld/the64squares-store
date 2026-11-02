export type Colour = "w" | "b"
export type GamePlayer = { id: string; name: string } | null

export type GameState = {
  id: string
  mode: "friend" | "arena"
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
  { tc: "3+2", label: "Blitz", detail: "3 min + 2 s" },
  { tc: "5+3", label: "Blitz", detail: "5 min + 3 s" },
  { tc: "10+5", label: "Rapid", detail: "10 min + 5 s" },
  { tc: "15+10", label: "Rapid", detail: "15 min + 10 s" },
  { tc: "30+20", label: "Classical", detail: "30 min + 20 s" },
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
}

export const resultText = (g: Pick<GameState, "status" | "result" | "reason" | "white" | "black">) => {
  if (g.status === "aborted") return g.reason === "no-start" ? "Game aborted: the first move wasn't played in time." : "Game aborted."
  if (!g.result) return ""
  const how = g.reason ? REASONS[g.reason] ?? "" : ""
  if (g.result === "1/2-1/2") return `Draw ${how}`.trim()
  const winner = g.result === "1-0" ? g.white?.name ?? "White" : g.black?.name ?? "Black"
  return `${winner} wins ${how}`.trim()
}
