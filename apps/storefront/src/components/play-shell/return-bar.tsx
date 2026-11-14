"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { refreshLive, useLiveNow } from "@/lib/chess/live-now"
import type { PlayPass } from "@/lib/play"

// Left a game for another page (a misclick, a quick look at something)? A bar at the top of
// every Play page leads straight back, while the game is still on.
export function ReturnBar({ pass }: { pass: PlayPass | null }) {
  const path = usePathname()
  const data = useLiveNow(pass)
  // Check again on every page change: someone who just left a game sees the bar at once.
  useEffect(() => {
    refreshLive()
  }, [path])

  // A tournament lobby opens the player's own game by itself (and has its own way back).
  if (/^\/play\/tournaments\/[^/]+\/lobby/.test(path)) return null
  const game = data?.games.find((g) => path !== `/play/${g.id}`)
  if (!game || data?.games.some((g) => path === `/play/${g.id}`)) return null
  return (
    <Link
      href={`/play/${game.id}`}
      className="return-bar sticky top-[52px] z-30 lg:top-0 -mx-3 -mt-3 mb-3 flex items-center justify-between gap-3 px-3 py-2.5 text-white sm:-mx-5 sm:px-5 lg:-mx-8 lg:-mt-6 lg:mb-6 lg:px-8"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="live-dot shrink-0 !bg-white" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[14px] font-bold leading-tight">Your game is still on</span>
          <span className="block truncate text-[12px] text-white/85">
            {game.colour ? `vs ${game.opponent}` : game.opponent} · your clock may be running
          </span>
        </span>
      </span>
      <span className="shrink-0 rounded-md bg-white px-3 py-1.5 text-[13px] font-extrabold text-[#b3261e]">Return to game</span>
    </Link>
  )
}
