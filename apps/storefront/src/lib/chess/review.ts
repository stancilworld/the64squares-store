import { Chess, type Square } from "chess.js"

// Game review: how good each move was, from engine evaluations before and after it.
// Evaluations are turned into winning chances (0–100 %) so that losing 100 centipawns in a
// level position counts for much more than in a position that's already won.

export type Kind = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder" | "forced"

export const KINDS: Record<Kind, { label: string; symbol: string; colour: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!", colour: "#1baca6" },
  great: { label: "Great move", symbol: "!", colour: "#5c8bb0" },
  best: { label: "Best", symbol: "★", colour: "#81b64c" },
  excellent: { label: "Excellent", symbol: "👍", colour: "#81b64c" },
  good: { label: "Good", symbol: "✓", colour: "#95b776" },
  book: { label: "Book", symbol: "📖", colour: "#a88865" },
  forced: { label: "Forced", symbol: "→", colour: "#97a59a" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", colour: "#f7c631" },
  mistake: { label: "Mistake", symbol: "?", colour: "#ffa459" },
  miss: { label: "Miss", symbol: "✕", colour: "#ff7769" },
  blunder: { label: "Blunder", symbol: "??", colour: "#fa412d" },
}

export type Eval = { cp: number | null; mate: number | null; best: string | null; pv: string[] }

// White's winning chances for an evaluation given from the side to move's view.
export const whiteWin = (e: Eval, whiteToMove: boolean) => {
  let cp: number
  // mate 0: the side to move is checkmated.
  if (e.mate != null) cp = e.mate > 0 ? 10000 : -10000
  else cp = e.cp ?? 0
  if (!whiteToMove) cp = -cp
  if (Math.abs(cp) >= 10000) return cp > 0 ? 100 : 0
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

// White's score as shown on the bar and in the move list: "+1.4", "-0.3", "M3".
export const evalText = (e: Eval, whiteToMove: boolean) => {
  if (e.mate != null) {
    const m = whiteToMove ? e.mate : -e.mate
    return m === 0 ? "#" : `${m > 0 ? "" : "-"}M${Math.abs(m)}`
  }
  const cp = (e.cp ?? 0) * (whiteToMove ? 1 : -1)
  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)}`
}

// Accuracy for one move from the drop in the mover's winning chances.
export const moveAccuracy = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669))

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// A piece left where it can be taken for less than it's worth (a sacrifice when it's the best move).
const isSacrifice = (after: Chess, to: Square) => {
  const piece = after.get(to)
  if (!piece || piece.type === "p" || piece.type === "k") return false
  const them = piece.color === "w" ? "b" : "w"
  const attackers = after.attackers(to, them)
  if (!attackers.length) return false
  const cheapest = Math.min(...attackers.map((sq) => VALUE[after.get(sq)?.type ?? "q"]))
  const defended = after.attackers(to, piece.color).length > 0
  return cheapest < VALUE[piece.type] || !defended
}

export type Reviewed = {
  san: string
  uci: string
  from: string
  to: string
  colour: "w" | "b"
  fenBefore: string
  fenAfter: string
  kind: Kind
  loss: number
  accuracy: number
  // White's winning chances after the move, and the engine's best move before it.
  winAfter: number
  evalAfter: string
  best: string | null
  bestSan: string | null
}

// evals[i] is the evaluation of the position after i moves (evals[0] = start).
export const reviewGame = (sans: string[], evals: Eval[], startFen?: string): Reviewed[] => {
  const c = new Chess(startFen)
  const out: Reviewed[] = []
  for (let i = 0; i < sans.length && i + 1 < evals.length; i++) {
    const before = evals[i]
    const after = evals[i + 1]
    const fenBefore = c.fen()
    const whiteMoves = c.turn() === "w"
    const legal = c.moves().length
    let bestSan: string | null = null
    if (before.best) {
      try {
        bestSan = new Chess(fenBefore).move({ from: before.best.slice(0, 2), to: before.best.slice(2, 4), promotion: before.best[4] }).san
      } catch {}
    }
    const m = c.move(sans[i])
    const uci = `${m.from}${m.to}${m.promotion ?? ""}`
    const wBefore = whiteWin(before, whiteMoves)
    const wAfter = whiteWin(after, !whiteMoves)
    const mine = (w: number) => (whiteMoves ? w : 100 - w)
    const loss = Math.max(0, mine(wBefore) - mine(wAfter))
    const isBest = before.best === uci || c.isCheckmate()
    const prev = out[out.length - 1]
    let kind: Kind
    if (legal === 1) kind = "forced"
    else if (i < 8 && loss < 3) kind = "book"
    else if (isBest && loss < 2 && mine(wBefore) < 92 && isSacrifice(c, m.to as Square)) kind = "brilliant"
    else if (isBest && prev && (prev.kind === "mistake" || prev.kind === "blunder") && loss < 2) kind = "great"
    else if (isBest || loss < 1) kind = "best"
    else if (loss < 3) kind = "excellent"
    else if (loss < 7) kind = "good"
    else if (prev && (prev.kind === "mistake" || prev.kind === "blunder") && loss >= 10) kind = "miss"
    else if (loss < 12) kind = "inaccuracy"
    else if (loss < 22) kind = "mistake"
    else kind = "blunder"
    out.push({
      san: m.san,
      uci,
      from: m.from,
      to: m.to,
      colour: whiteMoves ? "w" : "b",
      fenBefore,
      fenAfter: c.fen(),
      kind,
      loss,
      accuracy: moveAccuracy(loss),
      winAfter: wAfter,
      evalAfter: evalText(after, !whiteMoves),
      best: before.best,
      bestSan,
    })
  }
  return out
}

// A player's accuracy over the game: the mean of their move accuracies, pulled towards the
// harmonic mean so a few blunders count as they should.
export const gameAccuracy = (moves: Reviewed[], colour: "w" | "b") => {
  const acc = moves.filter((m) => m.colour === colour && m.kind !== "forced").map((m) => m.accuracy)
  if (!acc.length) return null
  const mean = acc.reduce((a, b) => a + b, 0) / acc.length
  const harmonic = acc.length / acc.reduce((a, b) => a + 1 / Math.max(1, b), 0)
  return Math.round(((mean + harmonic) / 2) * 10) / 10
}
