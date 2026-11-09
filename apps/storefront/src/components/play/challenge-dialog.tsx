"use client"

import { useState, useSyncExternalStore } from "react"
import { challengeError, sendChallenge } from "@/components/play-shell/live"
import type { PublicProfile } from "@/lib/profile-types"
import { Avatar } from "./avatar"

// "Challenge a friend": pick a time control and colour, then the friend gets a pop-up.
let target: PublicProfile | null = null
const listeners = new Set<() => void>()
const set = (p: PublicProfile | null) => {
  target = p
  for (const l of listeners) l()
}
export const openChallenge = (p: PublicProfile) => set(p)

const TCS = [
  ["1+0", "1 min"],
  ["3+2", "3 | 2"],
  ["5+0", "5 min"],
  ["10+0", "10 min"],
  ["15+10", "15 | 10"],
  ["30+0", "30 min"],
] as const

export function ChallengeDialog() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => target,
    () => null
  )
  const [tc, setTc] = useState("10+0")
  const [colour, setColour] = useState<"w" | "b" | "random">("random")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!t) return null

  const send = async () => {
    setBusy(true)
    setError(null)
    const res = await sendChallenge(t, tc, colour)
    setBusy(false)
    if (res.ok) set(null)
    else setError(challengeError(t.display_name, res.error))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Challenge">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={() => set(null)} />
      <div className="relative w-full rounded-t-2xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5 shadow-2xl sm:max-w-[420px] sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <Avatar url={t.avatar_url} name={t.display_name} size={48} online={t.online} />
          <div>
            <p className="g-title !text-[19px]">Challenge {t.display_name}</p>
            <p className="g-muted text-[13px]">@{t.username}</p>
          </div>
        </div>
        <p className="mt-4 text-[12px] font-semibold text-[var(--g-muted)]">Time control</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {TCS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={tc === v} onClick={() => setTc(v)} className="g-choice h-[44px] text-[14px] font-bold">
              {label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12px] font-semibold text-[var(--g-muted)]">I play</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["w", "White"],
              ["random", "Random"],
              ["b", "Black"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={colour === v} onClick={() => setColour(v)} className="g-choice h-[40px] text-[14px] font-semibold">
              {label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-[14px] text-[var(--g-bad)]">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="g-btn" onClick={() => set(null)}>
            Cancel
          </button>
          <button type="button" disabled={busy} className="g-btn g-btn-primary" onClick={send}>
            {busy ? "Sending…" : "Send challenge"}
          </button>
        </div>
        <p className="g-muted mt-3 text-[12px]">Friendly games are casual: they don&apos;t change ratings.</p>
      </div>
    </div>
  )
}
