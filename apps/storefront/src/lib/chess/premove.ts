import type { Square } from "chess.js"

// Where a piece could go next turn, judged by how it moves and ignoring other pieces
// (the position will change before the premove is played; it is checked again then).
const FILES = "abcdefgh"

export const premoveTargets = (square: Square, type: string, colour: "w" | "b", canCastle = true): Square[] => {
  const f = FILES.indexOf(square[0])
  const r = Number(square[1]) - 1
  const out: string[] = []
  const add = (df: number, dr: number) => {
    const nf = f + df
    const nr = r + dr
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(`${FILES[nf]}${nr + 1}`)
  }
  const ray = (df: number, dr: number) => {
    for (let i = 1; i < 8; i++) add(df * i, dr * i)
  }
  const dir = colour === "w" ? 1 : -1
  switch (type) {
    case "p":
      add(0, dir)
      if ((colour === "w" && r === 1) || (colour === "b" && r === 6)) add(0, 2 * dir)
      add(-1, dir)
      add(1, dir)
      break
    case "n":
      for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(a, b)
      break
    case "b":
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(a, b)
      break
    case "r":
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(a, b)
      break
    case "q":
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) ray(a, b)
      break
    case "k":
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) add(a, b)
      if (canCastle && f === 4 && r === (colour === "w" ? 0 : 7)) {
        add(2, 0)
        add(-2, 0)
      }
      break
  }
  return out as Square[]
}
