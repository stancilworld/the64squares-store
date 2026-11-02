"use client"

import { useSyncExternalStore } from "react"

// How the board looks and sounds, remembered per browser.

export const BOARD_THEMES = {
  green: { label: "Green", light: "#ecead1", dark: "#75955a" },
  walnut: { label: "Walnut", light: "#ecd9b6", dark: "#8b5a3c" },
  blue: { label: "Blue", light: "#dee3e6", dark: "#8ca2ad" },
  sand: { label: "Sand", light: "#f0d9b5", dark: "#b58863" },
} as const
export const PIECE_SETS = {
  modern: { label: "Modern" },
  classic: { label: "Classic" },
  playful: { label: "Playful" },
} as const

export type BoardSettings = {
  theme: keyof typeof BOARD_THEMES
  pieces: keyof typeof PIECE_SETS
  sound: boolean
  legalMoves: boolean
  animation: "off" | "fast" | "normal"
}

const DEFAULTS: BoardSettings = { theme: "green", pieces: "modern", sound: true, legalMoves: true, animation: "normal" }
const KEY = "t64:board"
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
