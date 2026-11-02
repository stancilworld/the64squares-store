"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GAME_URL, tcText } from "@/lib/game-types"
import { GIcon } from "@/components/play-shell/icons"
import { PreviewLayout } from "./preview-board"

type Live = { id: string; white_name: string | null; black_name: string | null; initial_ms: number; increment_ms: number }

const CARDS = [
  { href: "/play/online", icon: "bolt", title: "Play online", text: "Rated games against a player of your level", main: true },
  { href: "/play/computer", icon: "cpu", title: "Play the computer", text: "Eight levels, from beginner to master" },
  { href: "/play/friend", icon: "friend", title: "Play a friend", text: "Send a link on WhatsApp and play" },
  { href: "/play/tournaments", icon: "trophy", title: "Tournaments", text: "Free online arenas, any time they run" },
]

// The Play menu: the ways to play beside an empty board, and the way back to a live game.
export function PlayHub({ meId, myName }: { meId: string | null; myName: string | null }) {
  const [live, setLive] = useState<Live | null>(null)

  useEffect(() => {
    if (!meId) return
    void fetch(`${GAME_URL}/game/players/${meId}/live`)
      .then((r) => r.json())
      .then((d) => setLive(d.games?.[0] ?? null))
      .catch(() => {})
  }, [meId])

  return (
    <PreviewLayout
      myName={myName}
      panel={
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
          <h1 className="g-title hidden !text-[28px] lg:block">Play chess</h1>
          {live && (
            <Link href={`/play/${live.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#b23b31] px-4 py-3 text-white shadow-[0_3px_0_#6f221c]">
              <span>
                <span className="block text-[15px] font-bold">Your game is still on</span>
                <span className="block text-[13px] text-white/85">
                  {live.white_name} vs {live.black_name} · {tcText(live.initial_ms, live.increment_ms)}
                </span>
              </span>
              <span className="text-[14px] font-bold">Return →</span>
            </Link>
          )}
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`group flex items-center gap-4 rounded-xl px-4 py-4 transition active:translate-y-0.5 ${
                c.main
                  ? "bg-gradient-to-b from-[#e6c57f] to-[#c99a4c] text-[#1d1408] shadow-[0_4px_0_#8b6530] hover:brightness-105"
                  : "bg-[var(--g-panel-2)] shadow-[0_3px_0_rgba(0,0,0,0.35)] hover:bg-[var(--g-panel-3)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.main ? "bg-[#1d1408]/15" : "bg-[var(--g-panel-3)] text-[var(--g-gold)] group-hover:bg-[var(--g-panel)]"}`}
              >
                <GIcon name={c.icon} size={26} />
              </span>
              <span className="min-w-0">
                <span className="block text-[19px] font-bold leading-tight">{c.title}</span>
                <span className={`mt-0.5 block text-[13px] ${c.main ? "text-[#1d1408]/75" : "g-muted"}`}>{c.text}</span>
              </span>
            </Link>
          ))}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
            <Link href="/play/history" className="g-btn text-[14px]">
              <GIcon name="history" size={18} />
              Game history
            </Link>
            <Link href="/play/leaderboard" className="g-btn text-[14px]">
              <GIcon name="chart" size={18} />
              Leaderboard
            </Link>
          </div>
        </div>
      }
    />
  )
}
