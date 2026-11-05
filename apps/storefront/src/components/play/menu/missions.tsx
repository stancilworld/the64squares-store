"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GAME_URL } from "@/lib/game-types"

type Mission = { id: string; title: string; target: number; xp: number; progress: number; done: boolean; claimed: boolean }
type List = { day: string; missions: Mission[]; can_claim: boolean }

const ICON: Record<string, string> = { play3: "♟️", rapid1: "⏱️", win1: "🏆", bot4: "🤖", puzzles5: "🧩", daily: "📅" }
const LINK: Record<string, string> = {
  play3: "/play/online",
  rapid1: "/play/online?tc=10%2B0",
  win1: "/play/online",
  bot4: "/play/computer",
  puzzles5: "/play/puzzles/train",
  daily: "/play/puzzles/daily",
}

// Today's three missions on the Play home, with a Claim button for the XP.
export function DailyMissions({ token, signedIn }: { token: string | null; signedIn: boolean }) {
  const [list, setList] = useState<List | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let live = true
    fetch(`${GAME_URL}/game/missions`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setList(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token])

  const claim = async (m: Mission) => {
    const r = await fetch(`${GAME_URL}/game/missions/${m.id}/claim`, { method: "POST", headers: { authorization: `Bearer ${token}` } })
    if (!r.ok) return
    const d = (await r.json()) as List & { xp: number }
    setList(d)
    if (d.xp) {
      setFlash(m.id)
      setTimeout(() => setFlash(null), 1600)
    }
  }

  const left = (() => {
    const h = 24 - ((new Date().getUTCHours() + 5.5) % 24)
    return h >= 1 ? `${Math.floor(h)}h left` : "less than an hour left"
  })()

  return (
    <section className="menu-card menu-rise p-4 sm:p-5" aria-label="Daily missions">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--g-gold)]">Daily missions</h2>
        <span className="g-muted text-[12px]">New ones every day · {list ? left : ""}</span>
      </div>
      {!list ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl bg-black/20" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {list.missions.map((m) => (
            <div key={m.id} className={`relative flex items-center gap-3 rounded-xl bg-black/20 p-3 ${m.claimed ? "opacity-60" : ""}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--g-panel-3)] text-[20px]" aria-hidden="true">
                {ICON[m.id] ?? "⭐"}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={LINK[m.id] ?? "/play"} className="block truncate text-[14px] font-bold hover:underline">
                  {m.title}
                </Link>
                <div className="menu-xp mt-1.5 h-[6px] overflow-hidden rounded-full">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                </div>
                <p className="g-muted mt-1 text-[11px]">
                  {m.progress}/{m.target} · +{m.xp} XP
                </p>
              </div>
              {m.claimed ? (
                <span className="text-[13px] font-bold text-[#5fd07a]">✓</span>
              ) : m.done && list.can_claim ? (
                <button type="button" onClick={() => claim(m)} className="g-btn g-btn-primary !min-h-[34px] !px-3 !text-[13px]">
                  Claim
                </button>
              ) : null}
              {flash === m.id && (
                <span className="menu-rise pointer-events-none absolute -top-2 right-3 rounded-full bg-[var(--g-gold)] px-2 py-0.5 text-[12px] font-black text-[#1d1408]">+{m.xp} XP</span>
              )}
            </div>
          ))}
        </div>
      )}
      {list && !signedIn && (
        <p className="g-muted mt-2 text-[12px]">
          <Link href="/account?next=/play" className="text-[var(--g-gold)] underline underline-offset-2">
            Sign up
          </Link>{" "}
          to claim mission XP.
        </p>
      )}
    </section>
  )
}
