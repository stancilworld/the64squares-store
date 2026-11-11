"use client"

import { useSyncExternalStore } from "react"
import { formatShortDate } from "@/lib/delivery-date"

// The clock, ticking every 30 seconds (null while the page is built on the server).
const tick = (cb: () => void) => {
  const t = setInterval(cb, 30_000)
  return () => clearInterval(t)
}
const nowSlot = () => Math.floor(Date.now() / 30_000) * 30_000
const serverSlot = () => null

// "Sale ends in 1d 4h 12m": a live countdown in the last 3 days of a sale, its date before.
export function SaleCountdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt).getTime()
  const now = useSyncExternalStore(tick, nowSlot, serverSlot)
  const left = now === null ? Infinity : end - now
  if (left <= 0) return <>Sale ended</>
  if (left > 3 * 86_400_000) return <>Sale ends {formatShortDate(endsAt)}</>
  const d = Math.floor(left / 86_400_000)
  const h = Math.floor((left % 86_400_000) / 3_600_000)
  const m = Math.max(1, Math.floor((left % 3_600_000) / 60_000))
  return (
    <span role="timer" aria-live="off">
      Sale ends in {d > 0 ? `${d}d ` : ""}
      {h}h {m}m
    </span>
  )
}
