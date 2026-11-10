"use client"

import { useSyncExternalStore } from "react"

// How the board looks and sounds, remembered per browser.

export const BOARD_THEMES = {
  walnut: { label: "Walnut", light: "#ecd9b6", dark: "#8b5a3c" },
  maple: { label: "Maple", light: "#f2e3c6", dark: "#b88a5a" },
  velvet: { label: "Velvet", light: "#ecdfc4", dark: "#3e6b52" },
  slate: { label: "Slate", light: "#dfe3e6", dark: "#6f8796" },
  marble: { label: "Marble", light: "#e9e6df", dark: "#9c958a" },
} as const
export const PIECE_SETS = {
  // On the board, 3D Wood uses pictures taken from above and in front, standing on the square
  // with a shadow and rising above it (`tall` squares high); the upright ones are for icons.
  wood3d: { label: "3D Wood", ext: "webp", board: "wood3d-board", tall: 1.5 },
  ivory: { label: "Ivory", ext: "svg" },
  glossy: { label: "Glossy", ext: "svg" },
  modern: { label: "Flat", ext: "svg" },
  classic: { label: "Classic", ext: "svg" },
  playful: { label: "Playful", ext: "svg" },
} as const

// The picture for a piece, like "wK" (white king), in a piece set.
export const pieceSrc = (set: keyof typeof PIECE_SETS, code: string) => `/pieces/${set}/${code}.${PIECE_SETS[set]?.ext ?? "svg"}`

// The picture used on the board, and how many squares tall it is.
export const boardPiece = (set: keyof typeof PIECE_SETS, code: string) => {
  const s = PIECE_SETS[set] as { ext: string; board?: string; tall?: number } | undefined
  return s?.board ? { src: `/pieces/${s.board}/${code}.${s.ext}`, tall: s.tall ?? 1 } : { src: pieceSrc(set, code), tall: 1 }
}

export type BoardSettings = {
  theme: keyof typeof BOARD_THEMES
  pieces: keyof typeof PIECE_SETS
  sound: boolean
  legalMoves: boolean
  animation: "off" | "fast" | "normal"
  premove: boolean
  chat: boolean
  // How the last move is shown: coloured squares, a thin arrow, or not at all.
  lastMove: "highlight" | "arrow" | "none"
}

const DEFAULTS: BoardSettings = { theme: "walnut", pieces: "wood3d", sound: true, legalMoves: true, animation: "normal", premove: true, chat: true, lastMove: "highlight" }
// v4: new defaults (walnut board, 3D wood pieces) for everyone.
const KEY = "t64:board:v4"
const listeners = new Set<() => void>()
let current: BoardSettings | null = null

const read = (): BoardSettings => {
  if (current) return current
  let saved: Partial<BoardSettings> = {}
  try {
    saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}")
  } catch {}
  const s = { ...DEFAULTS, ...saved }
  if (!(s.theme in BOARD_THEMES)) s.theme = DEFAULTS.theme
  if (!(s.pieces in PIECE_SETS)) s.pieces = DEFAULTS.pieces
  if (!["highlight", "arrow", "none"].includes(s.lastMove)) s.lastMove = DEFAULTS.lastMove
  current = s
  return s
}

export const setBoardSettings = (patch: Partial<BoardSettings>) => {
  current = { ...read(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current))
  } catch {}
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getBoardSettings = () => (typeof window === "undefined" ? DEFAULTS : read())

export const useBoardSettings = () => useSyncExternalStore(subscribe, read, () => DEFAULTS)

export const animationMs = (s: BoardSettings) => (s.animation === "off" ? 0 : s.animation === "fast" ? 120 : 220)
