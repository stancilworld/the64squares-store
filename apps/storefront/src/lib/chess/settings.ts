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
  wood3d: { label: "3D Wood", ext: "webp" },
  ivory: { label: "Ivory", ext: "svg" },
  glossy: { label: "Glossy", ext: "svg" },
  modern: { label: "Flat", ext: "svg" },
  classic: { label: "Classic", ext: "svg" },
  playful: { label: "Playful", ext: "svg" },
} as const

// The picture for a piece, like "wK" (white king), in a piece set.
export const pieceSrc = (set: keyof typeof PIECE_SETS, code: string) => `/pieces/${set}/${code}.${PIECE_SETS[set]?.ext ?? "svg"}`

export type BoardSettings = {
  theme: keyof typeof BOARD_THEMES
  pieces: keyof typeof PIECE_SETS
  sound: boolean
  legalMoves: boolean
  animation: "off" | "fast" | "normal"
}

const DEFAULTS: BoardSettings = { theme: "walnut", pieces: "wood3d", sound: true, legalMoves: true, animation: "normal" }
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
