"use client"

import type { Colour } from "./board"
import { useBoardSettings } from "@/lib/chess/settings"

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
      className={`inline-flex min-w-[104px] items-center justify-end gap-2 rounded-md px-3 py-1.5 font-mono text-[22px] font-semibold tabular-nums leading-none transition-colors ${
        running ? (low ? "bg-love text-white" : "bg-[#262421] text-white") : "bg-[#e9e7e3] text-[#5c5853]"
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
}

// The strip above or below the board: who it is, what they've taken, and their clock.
export function PlayerBar({ name, colour, rating, provisional, diff, taken = [], lead = 0, clock, note, isBot }: Props) {
  const { pieces } = useBoardSettings()
  const other = colour === "w" ? "b" : "w"
  return (
    <div className="flex h-[52px] items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[15px] font-semibold ${
            isBot ? "bg-velvet text-maple" : colour === "w" ? "bg-[#f1efea] text-[#3b3835] ring-1 ring-black/10" : "bg-[#3b3835] text-white"
          }`}
        >
          {isBot ? "⚙" : name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5 truncate text-[15px] font-semibold leading-tight">
            <span className="truncate">{name}</span>
            {rating != null && (
              <span className="shrink-0 font-normal text-muted">
                ({rating}
                {provisional ? "?" : ""})
              </span>
            )}
            {diff != null && diff !== 0 && (
              <span className={`shrink-0 text-[13px] font-semibold ${diff > 0 ? "text-[#3f8f3a]" : "text-love"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </p>
          <div className="flex h-[18px] items-center">
            {note ? (
              <span className="text-[12px] text-love">{note}</span>
            ) : (
              <>
                {taken.map((t, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`/pieces/${pieces}/${other}${t.toUpperCase()}.svg`}
                    alt=""
                    className={`h-[18px] w-[18px] ${i > 0 && taken[i - 1] === t ? "-ml-[9px]" : ""}`}
                  />
                ))}
                {lead > 0 && <span className="ml-1 text-[12px] font-semibold text-muted">+{lead}</span>}
              </>
            )}
          </div>
        </div>
      </div>
      {clock && <Clock ms={clock.ms} running={clock.running} low={clock.running && clock.ms < 20_000} />}
    </div>
  )
}
