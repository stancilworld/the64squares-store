// Pure rules for choosing a House Player's level (tested without a database).

// Wait for a person first: 15 to 30 seconds.
export const houseWaitMs = (r: () => number = Math.random) => 15_000 + Math.round(r() * 15_000)

// Expected score against an opponent (the usual Elo formula).
const expected = (me: number, opp: number) => 1 / (1 + 10 ** ((opp - me) / 400))

// The level to aim for: the player's rating, nudged by how their last games went, so someone
// on a losing run gets a slightly easier game and someone winning everything a harder one.
// New players start a little below the default rating (most new players are beginners).
export const targetFrom = (o: { rating: number; games: number; recent: { score: number; opp: number }[] }) => {
  if (o.games === 0) return 1200
  let base = o.rating
  if (o.games < 5) base = Math.min(base, 1400)
  const diff = o.recent.reduce((s, g) => s + (g.score - expected(o.rating, g.opp)), 0)
  const nudge = Math.max(-200, Math.min(200, diff * 60))
  return Math.round(Math.max(400, Math.min(2400, base + nudge)))
}

