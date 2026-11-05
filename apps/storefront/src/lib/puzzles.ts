import { Chess } from "chess.js"
import { GAME_URL } from "./game-types"

export type Puzzle = { id: string; fen: string; moves: string[]; rating: number; themes: string[]; plays: number }
export type PuzzleStats = {
  rating: number
  provisional: boolean
  solved: number
  failed: number
  streak: number
  best_streak: number
  rush_best: number
  signed_in?: boolean
  daily_done?: boolean
}
export type PuzzleResult = PuzzleStats & { ok: boolean; rated: boolean; diff?: number; xp?: number }
export type Theme = { theme: string; name: string; count: number }

const call = async <T,>(path: string, token: string | null, init?: { method?: string; body?: unknown }): Promise<T> => {
  const res = await fetch(`${GAME_URL}/game/puzzles${path}`, {
    method: init?.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.body ? { "content-type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) throw new Error(`puzzles ${res.status}`)
  return res.json() as Promise<T>
}

export const puzzleApi = {
  me: (token: string | null) => call<PuzzleStats>("/me", token),
  next: (token: string | null, theme?: string | null) => call<{ puzzle: Puzzle }>(`/next${theme ? `?theme=${encodeURIComponent(theme)}` : ""}`, token),
  daily: (token: string | null) => call<{ date: string; puzzle: Puzzle }>("/daily", token),
  one: (token: string | null, id: string) => call<{ puzzle: Puzzle }>(`/${encodeURIComponent(id)}`, token),
  themes: () => call<{ themes: Theme[] }>("/themes", null),
  result: (token: string | null, id: string, solved: boolean) => call<PuzzleResult>(`/${encodeURIComponent(id)}/result`, token, { method: "POST", body: { solved } }),
  rush: (token: string | null) => call<{ puzzles: Puzzle[] }>("/rush", token),
  rushScore: (token: string | null, score: number) => call<{ ok: boolean; best: number | null; xp?: number }>("/rush", token, { method: "POST", body: { score } }),
}

// The position after the first `ply` moves of a puzzle, and the last of those moves.
export const positionAt = (p: Puzzle, ply: number) => {
  const c = new Chess(p.fen)
  let last: { from: string; to: string } | null = null
  for (const uci of p.moves.slice(0, ply)) {
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    last = { from: m.from, to: m.to }
  }
  return { fen: c.fen(), last, chess: c }
}

// Whether a move the player made at `ply` is right: the puzzle's move, or any move that
// mates (some puzzles have more than one mate on the last move).
export const isRightMove = (p: Puzzle, ply: number, uci: string) => {
  if (p.moves[ply] === uci) return true
  const c = positionAt(p, ply).chess
  try {
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return c.isCheckmate()
  } catch {
    return false
  }
}
