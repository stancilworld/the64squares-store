"use client"

import { useEffect, useSyncExternalStore } from "react"

// Focus mode: the game screen with nothing but the board, the players and their clocks.
// Remembered in this browser; F toggles it from the keyboard.

const KEY = "t64:focus"
const listeners = new Set<() => void>()
let on: boolean | null = null

const read = () => {
  if (on === null) {
    try {
      on = window.localStorage.getItem(KEY) === "1"
    } catch {
      on = false
    }
  }
  return on
}

export const setFocus = (v: boolean) => {
  on = v
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0")
  } catch {}
  document.documentElement.toggleAttribute("data-focus", v)
  for (const l of listeners) l()
}
export const toggleFocus = () => setFocus(!read())

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useFocus = () => useSyncExternalStore(subscribe, read, () => false)

// Turns focus mode on for the game screens that support it (and off again when leaving),
// and listens for the F key.
// The tools can be on screen twice (beside the board, and under it on phones), so the key
// listener is shared and counted: one press toggles once.
let users = 0
const onKey = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return
  if (e.key === "f" || e.key === "F") {
    e.preventDefault()
    toggleFocus()
  }
}

export function useFocusScreen() {
  const focus = useFocus()
  useEffect(() => {
    if (users++ === 0) {
      document.documentElement.toggleAttribute("data-focus", read())
      window.addEventListener("keydown", onKey)
    }
    return () => {
      if (--users === 0) {
        window.removeEventListener("keydown", onKey)
        document.documentElement.removeAttribute("data-focus")
      }
    }
  }, [])
  return focus
}
