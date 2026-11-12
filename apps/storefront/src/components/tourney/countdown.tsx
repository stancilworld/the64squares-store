"use client"

import { useSyncExternalStore } from "react"

const tick = (cb: () => void) => {
  const t = setInterval(cb, 1000)
  return () => clearInterval(t)
}
const nowSec = () => Math.floor(Date.now() / 1000) * 1000
const serverNow = () => null

export const useNow = () => useSyncExternalStore(tick, nowSec, serverNow)

const pad = (n: number) => String(n).padStart(2, "0")

// A scoreboard countdown: days, hours, minutes, seconds in big digits.
export function Countdown({ to, offset = 0, size = "lg" }: { to: number; offset?: number; size?: "lg" | "sm" }) {
  const now = useNow()
  if (now === null) return <span className="tabular-nums opacity-0">00:00:00</span>
  const left = Math.max(0, to - (now + offset))
  const s = Math.floor(left / 1000)
  const parts: [string, string][] = [
    ...(s >= 86400 ? ([[String(Math.floor(s / 86400)), "days"]] as [string, string][]) : []),
    [pad(Math.floor((s % 86400) / 3600)), "hrs"],
    [pad(Math.floor((s % 3600) / 60)), "min"],
    [pad(s % 60), "sec"],
  ]
  if (size === "sm") return <span className="tabular-nums">{parts.map((p) => p[0]).join(":")}</span>
  return (
    <span className="flex items-end gap-2" role="timer" aria-label={`${parts.map((p) => `${Number(p[0])} ${p[1]}`).join(", ")} left`}>
      {parts.map(([v, unit], i) => (
        <span key={unit} className="flex items-end gap-2">
          {i > 0 && <span className="pb-5 text-[28px] font-bold text-white/30">:</span>}
          <span className="flex flex-col items-center">
            <span className="min-w-[2.2ch] rounded-md bg-black/45 px-2 py-1 text-center text-[34px] font-extrabold leading-none tabular-nums tracking-tight text-white ring-1 ring-white/10 sm:text-[44px]">{v}</span>
            <span className="mt-1 text-[11px] font-semibold text-white/55">{unit}</span>
          </span>
        </span>
      ))}
    </span>
  )
}
