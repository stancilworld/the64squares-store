import crypto from "node:crypto"

// Daily missions: which three a player gets each day, and how progress is counted.

export type Day = {
  games: { mode: string; result: string | null; white_id: string | null; black_id: string | null; white_name: string | null; black_name: string | null; initial_ms: number }[]
  puzzlesSolved: number
  dailySolved: boolean
}

export type Mission = { id: string; title: string; target: number; xp: number; progress: (d: Day, me: string) => number }

const won = (g: Day["games"][number], me: string) => (g.white_id === me && g.result === "1-0") || (g.black_id === me && g.result === "0-1")
const vsComputer = (g: Day["games"][number]) => g.mode === "computer"
const computerLevel = (g: Day["games"][number]) => Number(/Level (\d)/.exec(`${g.white_name} ${g.black_name}`)?.[1] ?? 0)

const GROUPS: Mission[][] = [
  [
    { id: "play3", title: "Play 3 games", target: 3, xp: 25, progress: (d) => d.games.length },
    { id: "rapid1", title: "Play a rapid or classical game online", target: 1, xp: 25, progress: (d) => d.games.filter((g) => !vsComputer(g) && g.initial_ms >= 600_000).length },
  ],
  [
    { id: "win1", title: "Win a game against a person", target: 1, xp: 30, progress: (d, me) => d.games.filter((g) => !vsComputer(g) && won(g, me)).length },
    { id: "bot4", title: "Beat the computer at level 4 or higher", target: 1, xp: 30, progress: (d, me) => d.games.filter((g) => vsComputer(g) && computerLevel(g) >= 4 && won(g, me)).length },
  ],
  [
    { id: "puzzles5", title: "Solve 5 puzzles", target: 5, xp: 20, progress: (d) => d.puzzlesSolved },
    { id: "daily", title: "Solve the puzzle of the day", target: 1, xp: 15, progress: (d) => (d.dailySolved ? 1 : 0) },
  ],
]

// Today in India, as YYYY-MM-DD.
export const indiaDay = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)

export const missionsFor = (playerId: string, day: string) =>
  GROUPS.map((g, i) => {
    const h = crypto.createHash("sha1").update(`${playerId}:${day}:${i}`).digest()
    return g[h[0] % g.length]
  })

