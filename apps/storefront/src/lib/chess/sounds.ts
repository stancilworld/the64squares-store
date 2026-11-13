"use client"

import { getBoardSettings } from "./settings"

export type SoundName = "move" | "capture" | "check" | "castle" | "start" | "end" | "lowtime" | "illegal"

const cache = new Map<string, HTMLAudioElement>()

// Wooden pieces on a wooden board (made by scripts/wood-sounds.py; bump ?v= when they change). A move has three slightly
// different knocks, picked at random, so repeated moves don't sound mechanical.
const MOVE_VARIANTS = ["move", "move2", "move3"]

export const playSound = (name: SoundName) => {
  if (typeof window === "undefined" || !getBoardSettings().sound) return
  try {
    const file = name === "move" ? MOVE_VARIANTS[Math.floor(Math.random() * MOVE_VARIANTS.length)] : name
    let a = cache.get(file)
    if (!a) {
      a = new Audio(`/sounds/${file}.mp3?v=2`)
      a.preload = "auto"
      cache.set(file, a)
    }
    const play = a.cloneNode(true) as HTMLAudioElement
    play.volume = name === "start" || name === "end" ? 0.5 : 0.8
    void play.play().catch(() => {})
  } catch {}
}

// The sound for a move in standard notation (SAN).
export const soundForSan = (san: string | undefined): SoundName => {
  if (!san) return "move"
  if (san.includes("#")) return "end"
  if (san.includes("+")) return "check"
  if (san.startsWith("O-O")) return "castle"
  if (san.includes("x")) return "capture"
  return "move"
}
