// Experience: XP earned by playing, levels, and the title that goes with each level.
// Separate from rating: rating says how strong you are, level how much you've played.

// Total XP needed to reach a level: 0, 100, 300, 600, 1000, … (each level needs 100 more).
export const xpForLevel = (level: number) => 50 * (level - 1) * level

export const TITLES = [
  { from: 1, title: "Pawn" },
  { from: 5, title: "Knight" },
  { from: 10, title: "Bishop" },
  { from: 15, title: "Rook" },
  { from: 20, title: "Queen" },
  { from: 30, title: "King" },
  { from: 40, title: "Grandmaster" },
] as const

export const levelFor = (xp: number) => {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const title = [...TITLES].reverse().find((t) => level >= t.from)!.title
  const start = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, title, xp, into: xp - start, needed: next - start }
}

// XP for one finished game.
export const xpForGame = (o: { result: "win" | "draw" | "loss"; mode: string; computerLevel?: number; plies: number }) => {
  if (o.plies < 4) return 0
  if (o.mode === "computer") {
    const lvl = o.computerLevel ?? 1
    return o.result === "win" ? 8 + 3 * lvl : o.result === "draw" ? 5 + lvl : 3
  }
  const base = o.result === "win" ? 30 : o.result === "draw" ? 18 : 10
  return base + (o.mode === "arena" ? 5 : 0)
}
