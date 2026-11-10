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

// ---------------------------------------------------------------- queued premoves

export type Queued = { from: Square; to: Square }
type Piece = { type: string; color: "w" | "b" }

const placement = (fen: string) => {
  const board = new Map<string, Piece>()
  const rows = fen.split(" ")[0].split("/")
  rows.forEach((row, i) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        board.set(`${FILES[f]}${8 - i}`, { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" })
        f++
      }
    }
  })
  return board
}

const toFen = (board: Map<string, Piece>, rest: string) => {
  const rows: string[] = []
  for (let r = 8; r >= 1; r--) {
    let row = ""
    let empty = 0
    for (const file of FILES) {
      const p = board.get(`${file}${r}`)
      if (!p) {
        empty++
        continue
      }
      if (empty) row += empty
      empty = 0
      row += p.color === "w" ? p.type.toUpperCase() : p.type
    }
    rows.push(row + (empty ? empty : ""))
  }
  return `${rows.join("/")} ${rest}`
}

// The position as it will look once the queued premoves are played (pieces simply moved,
// castling moves the rook too, pawns reaching the end become queens). Shown on the board so
// each premove can start from where the previous one ends.
export const withPremoves = (fen: string, queue: Queued[]) => {
  const board = placement(fen)
  for (const { from, to } of queue) {
    const p = board.get(from)
    if (!p) continue
    board.delete(from)
    if (p.type === "k" && from[0] === "e" && (to[0] === "g" || to[0] === "c") && from[1] === to[1]) {
      const rook = `${to[0] === "g" ? "h" : "a"}${from[1]}`
      const r = board.get(rook)
      if (r?.type === "r") {
        board.delete(rook)
        board.set(`${to[0] === "g" ? "f" : "d"}${from[1]}`, r)
      }
    }
    board.set(to, p.type === "p" && (to[1] === "8" || to[1] === "1") ? { ...p, type: "q" } : p)
  }
  return { fen: toFen(board, fen.split(" ").slice(1).join(" ") || "w - - 0 1"), at: (sq: string) => board.get(sq) ?? null }
}
