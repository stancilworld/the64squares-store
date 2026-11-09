"use client"

import { GIcon } from "@/components/play-shell/icons"
import type { Colour } from "./board"
import { Avatar, LevelBadge } from "@/components/play/avatar"
import { pieceSrc, useBoardSettings } from "@/lib/chess/settings"
import type { Level } from "@/lib/profile-types"

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  if (s < 20) return s.toFixed(1)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}

export function Clock({ ms, running, low }: { ms: number; running: boolean; low: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[104px] items-center justify-end gap-2 rounded-md px-3 py-1.5 font-mono text-[22px] font-bold tabular-nums leading-none transition-colors ${
        running ? (low ? "bg-[#c6392f] text-white" : "bg-[#f3f0e9] text-[#14110e]") : "bg-[var(--g-panel-2)] text-[var(--g-muted)]"
      }`}
    >
      {running && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-current opacity-70" />}
      {fmt(ms)}
    </span>
  )
}

type Props = {
  name: string
  colour: Colour
  rating?: number | null
  provisional?: boolean
  diff?: number | null
  taken?: string[]
  lead?: number
  clock?: { ms: number; running: boolean } | null
  note?: React.ReactNode
  isBot?: boolean
  avatarUrl?: string | null
  level?: Level | null
  href?: string | null
  // Connection bars 1–4, 0 when offline; undefined hides them.
  signal?: number | null
}

const SIGNAL_TEXT = ["Offline", "Weak connection", "Fair connection", "Good connection", "Excellent connection"]
const SIGNAL_COLOUR = ["#8a8379", "#ff6b5e", "#f0b545", "#9bd36a", "#5fd07a"]

export function SignalBars({ level }: { level: number }) {
  const l = Math.max(0, Math.min(4, Math.round(level)))
  return (
    <span className="inline-flex h-[13px] shrink-0 items-end gap-[2px] self-center" role="img" aria-label={SIGNAL_TEXT[l]} title={SIGNAL_TEXT[l]}>
      {[1, 2, 3, 4].map((b) => (
        <span
          key={b}
          className="w-[3px] rounded-[1px] transition-colors"
          style={{ height: 3 + b * 2.5, background: b <= l ? SIGNAL_COLOUR[l] : "rgba(255,255,255,0.16)" }}
        />
      ))}
    </span>
  )
}

// The strip above or below the board: who it is, what they've taken, and their clock.
export function PlayerBar({ name, colour, rating, provisional, diff, taken = [], lead = 0, clock, note, isBot, avatarUrl, level, href, signal }: Props) {
  const { pieces } = useBoardSettings()
  const other = colour === "w" ? "b" : "w"
  return (
    <div className="flex h-[52px] items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {isBot || !avatarUrl ? (
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold ${
              isBot ? "bg-[var(--g-accent)] text-black" : colour === "w" ? "bg-[#ece9e2] text-[#2b2826]" : "bg-[#2b2826] text-white ring-1 ring-white/15"
            }`}
          >
            {isBot ? <GIcon name="cpu" size={20} /> : name.trim().charAt(0).toUpperCase() || "?"}
          </span>
        ) : (
          <Avatar url={avatarUrl} name={name} size={36} />
        )}
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5 truncate text-[15px] font-semibold leading-tight">
            {href ? (
              <a href={href} className="truncate hover:underline">
                {name}
              </a>
            ) : (
              <span className="truncate">{name}</span>
            )}
            {signal != null && <SignalBars level={signal} />}
            {level && <LevelBadge level={level} compact />}
            {rating != null && (
              <span className="shrink-0 font-normal text-[var(--g-muted)]">
                ({rating}
                {provisional ? "?" : ""})
              </span>
            )}
            {diff != null && diff !== 0 && (
              <span className={`shrink-0 text-[13px] font-semibold ${diff > 0 ? "text-[#7bd88f]" : "text-[var(--g-bad)]"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </p>
          <div className="flex h-[18px] items-center">
            {note ? (
              <span className="text-[12px] font-medium text-[var(--g-bad)]">{note}</span>
            ) : (
              <>
                {taken.map((t, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={pieceSrc(pieces, `${other}${t.toUpperCase()}`)}
                    alt=""
                    className={`h-[18px] w-[18px] ${i > 0 && taken[i - 1] === t ? "-ml-[9px]" : ""}`}
                  />
                ))}
                {lead > 0 && <span className="ml-1 text-[12px] font-semibold text-[var(--g-muted)]">+{lead}</span>}
              </>
            )}
          </div>
        </div>
      </div>
      {clock && <Clock ms={clock.ms} running={clock.running} low={clock.running && clock.ms < 20_000} />}
    </div>
  )
}
