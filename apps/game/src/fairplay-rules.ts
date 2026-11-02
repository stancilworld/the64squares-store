// Fair-play maths: how accurate a player's moves were (compared with a chess engine), how often
// they played the engine's first choice, and how that compares with what's normal at their
// rating. Pure functions, so they can be tested.

export type PositionEval = { cp: number; best: string | null; forced: boolean }

// Chance of winning (0–100) for a centipawn score, as on lichess.
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)

export const moveAccuracy = (before: number, after: number) => {
  const drop = winPct(before) - winPct(after)
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669))
}

// What a typical player of this rating scores (accuracy, 0–100).
export const expectedAccuracy = (rating: number) => Math.max(52, Math.min(93, 52 + (rating - 800) * 0.024))

export type PlayerAnalysis = { analysed: number; accuracy: number; match_pct: number; acpl: number; time_cv: number | null }

// evals[i] is the position before ply i (score for the side to move); evals has one more entry
// than moves. Opening moves, forced moves and positions already decided by a forced mate are left out.
export const analysePlayer = (evals: PositionEval[], uci: string[], colour: "w" | "b", moveMs: number[]): PlayerAnalysis => {
  let n = 0
  let accSum = 0
  let cplSum = 0
  let matches = 0
  const times: number[] = []
  for (let i = colour === "w" ? 0 : 1; i < uci.length; i += 2) {
    if (i < 8 || !evals[i] || !evals[i + 1] || evals[i].forced) continue
    const before = evals[i].cp
    if (Math.abs(before) >= 950) continue
    const after = -evals[i + 1].cp
    n++
    accSum += moveAccuracy(before, after)
    cplSum += Math.max(0, Math.min(1000, before - after))
    if (evals[i].best && evals[i].best === uci[i]) matches++
    if (moveMs[i] != null) times.push(moveMs[i])
  }
  let time_cv: number | null = null
  if (times.length >= 10) {
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length)
    time_cv = mean > 0 ? sd / mean : null
  }
  return {
    analysed: n,
    accuracy: n ? Math.round((accSum / n) * 10) / 10 : 0,
    match_pct: n ? Math.round((matches / n) * 100) : 0,
    acpl: n ? Math.round(cplSum / n) : 0,
    time_cv: time_cv == null ? null : Math.round(time_cv * 100) / 100,
  }
}

export type Signals = PlayerAnalysis & { rating: number; focus_losses: number; away_ms: number }

// A 0–100 suspicion score for one game, with the reasons in plain words.
export const gameRisk = (s: Signals) => {
  const reasons: string[] = []
  if (s.analysed < 15) return { risk: 0, reasons: ["Too few moves to judge"] }
  let risk = 0
  const expected = expectedAccuracy(s.rating)
  const excess = s.accuracy - expected
  if (excess > 8) {
    risk += Math.min(55, (excess - 8) * 4.5)
    reasons.push(`Accuracy ${s.accuracy}% — about ${Math.round(expected)}% is normal at rating ${s.rating}`)
  }
  if (s.match_pct >= 80 && s.analysed >= 20) {
    risk += 15
    reasons.push(`Played the engine's first choice in ${s.match_pct}% of moves`)
  }
  if (s.acpl <= 12 && s.analysed >= 20 && s.rating < 2000) {
    risk += 10
    reasons.push(`Average loss of only ${s.acpl} centipawns per move`)
  }
  if (s.focus_losses >= 3) {
    risk += excess > 0 ? 15 : 5
    reasons.push(`Left the game ${s.focus_losses} times during own moves (${Math.round(s.away_ms / 1000)} s away)`)
  }
  if (s.time_cv != null && s.time_cv < 0.35 && s.analysed >= 20) {
    risk += 10
    reasons.push(`Unusually even thinking time on every move`)
  }
  return { risk: Math.min(100, Math.round(risk)), reasons }
}

// Whether a player's recent games together deserve a human look.
export const shouldFlag = (risks: number[]) => {
  if (risks.some((r) => r >= 75)) return true
  const recent = risks.slice(0, 10)
  return recent.length >= 3 && recent.reduce((a, b) => a + b, 0) / recent.length >= 45
}
