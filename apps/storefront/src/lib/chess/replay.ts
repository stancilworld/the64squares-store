import { Chess } from "chess.js"

export type Ply = { san: string; fen: string; from: string; to: string; check: boolean }

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// Every position of a game, from its moves in standard notation.
export const replay = (sans: string[]): Ply[] => {
  const chess = new Chess()
  const out: Ply[] = []
  for (const san of sans) {
    try {
      const m = chess.move(san)
      out.push({ san: m.san, fen: chess.fen(), from: m.from, to: m.to, check: chess.inCheck() })
    } catch {
      break
    }
  }
  return out
}
