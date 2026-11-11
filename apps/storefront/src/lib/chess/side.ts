"use client"

import { useEffect, useSyncExternalStore } from "react"

// The Play side menu folds to icons while a game is on (more room for the board). The arrow
// button opens or folds it by hand; that choice lasts until the next game starts or ends.

const listeners = new Set<() => void>()
let gameOn = false
let manual: boolean | null = null

const emit = () => {
  for (const l of listeners) l()
}
const folded = () => manual ?? gameOn

export const setGameOn = (v: boolean) => {
  if (gameOn === v) return
  gameOn = v
  manual = null
  emit()
}
export const toggleSide = () => {
  manual = !folded()
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useSideFolded = () => useSyncExternalStore(subscribe, folded, () => false)

// Game screens call this while a game is on. The game's tools can be on screen twice
// (beside the board, and under it on phones), so the calls are counted.
let games = 0
export function useGameOn(on = true) {
  useEffect(() => {
    if (!on) return
    games++
    setGameOn(true)
    return () => {
      if (--games === 0) setGameOn(false)
    }
  }, [on])
}
