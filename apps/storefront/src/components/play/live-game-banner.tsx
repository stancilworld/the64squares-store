"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { GAME_URL, LIVE_KEY } from "@/lib/game-types"

// If this browser has a game still running (say the tab was closed by mistake),
// a bar at the bottom of every page leads back to it.
export function LiveGameBanner() {
  const path = usePathname()
  const [game, setGame] = useState<{ id: string; opponent: string; path: string } | null>(null)

  useEffect(() => {
    let id: string | null = null
    try {
      id = window.localStorage.getItem(LIVE_KEY)
    } catch {}
    if (!id || path === `/play/${id}`) return
    let live = true
    void fetch(`${GAME_URL}/game/games/${id}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return
        if (d?.status === "active") setGame({ id: d.id, opponent: `${d.white?.name ?? "?"} vs ${d.black?.name ?? "?"}`, path })
        else {
          setGame(null)
          try {
            window.localStorage.removeItem(LIVE_KEY)
          } catch {}
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path])

  // Only what was checked for this page counts (the game may have ended since).
  if (!game || game.path !== path || path === `/play/${game.id}`) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <Link
        href={`/play/${game.id}`}
        className="flex w-full max-w-[560px] items-center justify-between gap-3 rounded-md bg-love px-4 py-3 text-white shadow-xl"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">Your game is still on — your clock may be running</span>
          <span className="block truncate text-[13px] text-white/85">{game.opponent}</span>
        </span>
        <span className="shrink-0 text-[14px] font-semibold">Return →</span>
      </Link>
    </div>
  )
}
