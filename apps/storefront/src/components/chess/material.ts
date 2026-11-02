import type { Colour } from "./board"

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const ORDER = ["q", "r", "b", "n", "p"]

// Pieces each side has taken, and who is ahead on material, from a position.
export const material = (fen: string) => {
  const board = fen.split(" ")[0]
  const count: Record<Colour, Record<string, number>> = { w: {}, b: {} }
  for (const ch of board) {
    if (!/[pnbrq]/i.test(ch)) continue
    const c: Colour = ch === ch.toUpperCase() ? "w" : "b"
    const t = ch.toLowerCase()
    count[c][t] = (count[c][t] ?? 0) + 1
  }
  // Pieces taken BY a side are the other side's missing pieces (promotions can make this negative).
  const taken = (by: Colour) => {
    const other = by === "w" ? "b" : "w"
    return ORDER.flatMap((t) => Array(Math.max(0, START[t] - (count[other][t] ?? 0))).fill(t) as string[])
  }
  const score = (c: Colour) => ORDER.reduce((s, t) => s + (count[c][t] ?? 0) * VALUE[t], 0)
  return { taken: { w: taken("w"), b: taken("b") }, lead: score("w") - score("b") }
}
