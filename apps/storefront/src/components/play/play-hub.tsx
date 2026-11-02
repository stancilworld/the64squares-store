"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GAME_URL, tcText } from "@/lib/game-types"
import { PreviewLayout } from "./preview-board"

type Live = { id: string; white_name: string | null; black_name: string | null; initial_ms: number; increment_ms: number }

const CARDS = [
  { href: "/play/online", icon: "⚡", title: "Play online", text: "Rated games against a player of similar strength" },
  { href: "/play/computer", icon: "⚙", title: "Play the computer", text: "Eight levels, from beginner to master" },
  { href: "/play/friend", icon: "🤝", title: "Play a friend", text: "Send a link on WhatsApp and play" },
  { href: "/tournaments", icon: "🏆", title: "Tournaments", text: "Online arenas and over-the-board events" },
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <h1 className="font-display h-section">Play chess</h1>
          {live && (
            <Link href={`/play/${live.id}`} className="flex items-center justify-between gap-3 rounded-md bg-love px-4 py-3 text-white">
              <span>
                <span className="block text-[15px] font-semibold">Your game is still on</span>
                <span className="block text-[13px] text-white/85">
                  {live.white_name} vs {live.black_name} · {tcText(live.initial_ms, live.increment_ms)}
                </span>
              </span>
              <span className="text-[14px] font-semibold">Return →</span>
            </Link>
          )}
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-center gap-4 rounded-md border border-rule bg-white px-4 py-4 transition hover:border-velvet hover:bg-maple-soft"
            >
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-velvet text-[22px] text-maple">
                {c.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[20px] leading-tight">{c.title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{c.text}</span>
              </span>
            </Link>
          ))}
          <div className="mt-auto flex justify-center gap-6 pt-2 text-[14px] font-medium">
            <Link href="/play/history" className="underline-offset-4 hover:underline">
              Game history
            </Link>
            <Link href="/play/leaderboard" className="underline-offset-4 hover:underline">
              Leaderboard
            </Link>
          </div>
        </div>
      }
    />
  )
}
