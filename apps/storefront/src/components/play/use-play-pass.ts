"use client"

import { useEffect, useState } from "react"
import { getGuestPass, type PlayPass } from "@/lib/play"

// The signed-in player's pass, or (for visitors) a guest pass fetched once in the browser.
export function usePlayPass(initial: PlayPass | null) {
  const [guest, setGuest] = useState<PlayPass | null>(null)
  useEffect(() => {
    if (initial) return
    let live = true
    getGuestPass()
      .then((p) => live && setGuest(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [initial])
  return initial ?? guest
}
