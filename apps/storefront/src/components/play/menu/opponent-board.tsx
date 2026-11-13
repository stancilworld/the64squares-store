"use client"

import { Avatar } from "@/components/play/avatar"
import { GIcon } from "@/components/play-shell/icons"
import { speedOf } from "@/lib/game-types"
import { nowMs } from "@/lib/clock"
import type { HouseCard, Seeker } from "./screen"

// The opponents board on Play online: people waiting for a game right now first, then House
// Players (computer opponents, clearly marked) so there's always someone to play. Every card
// shows who it is and the match, in its speed's colour.

export const SPEEDS = {
  bullet: { label: "Bullet", colour: "#ff4d5e", time: "1–2 min", about: "Pure speed. Instinct and quick hands." },
  blitz: { label: "Blitz", colour: "#ffb300", time: "3–5 min", about: "Fast and tactical: the most played." },
  rapid: { label: "Rapid", colour: "#2fd27a", time: "10–15 min", about: "Time to think, plan and calculate." },
  classical: { label: "Classical", colour: "#4b8dff", time: "30 min", about: "Slow, deep chess, like a real tournament." },
} as const
export type SpeedKey = keyof typeof SPEEDS

const speedOfTc = (tc: string): SpeedKey => {
  const [m, i] = tc.split("+").map(Number)
  return speedOf(m * 60000, i * 1000) as SpeedKey
}
const tcText = (tc: string) => {
  const [m, i] = tc.split("+")
  return i === "0" ? `${m} min` : `${m}+${i}`
}

function Card({
  name,
  sub,
  avatar,
  rating,
  tc,
  badge,
  live,
  onClick,
  disabled,
}: {
  name: string
  sub: string
  avatar: string | null
  rating: string
  tc: string
  badge: React.ReactNode
  live?: string
  onClick: () => void
  disabled?: boolean
}) {
  const sp = SPEEDS[speedOfTc(tc)]
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pick-card" style={{ "--sp": sp.colour } as React.CSSProperties}>
      <span className="pick-band" aria-hidden="true" />
      <span className="flex items-center gap-3">
        <Avatar url={avatar} name={name} size={48} className="shrink-0 [&>*]:!rounded-xl" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[16px] font-bold leading-tight">{name}</span>
          <span className="block truncate text-[12px] text-[var(--g-muted)]">{sub}</span>
        </span>
        <span className="text-right">
          <span className="block text-[20px] font-extrabold leading-none tabular-nums">{rating}</span>
          <span className="text-[11px] text-[var(--g-muted)]">rating</span>
        </span>
      </span>
      <span className="mt-3 flex items-center gap-2">
        <span className="pick-speed">
          {sp.label} · {tcText(tc)}
        </span>
        {badge}
        {live && <span className="ml-auto text-[12px] font-semibold text-[var(--g-good)]">{live}</span>}
      </span>
      <span className="pick-go">Play</span>
    </button>
  )
}

export function OpponentBoard({
  seekers,
  house,
  onPick,
  onHouse,
  disabled,
  guest,
}: {
  seekers: Seeker[]
  house: HouseCard[]
  onPick: (tc: string) => void
  onHouse: (h: HouseCard) => void
  disabled?: boolean
  guest: boolean
}) {
  const now = nowMs()
  const people = [...seekers].sort((a, b) => a.since - b.since).slice(0, 8)
  const fill = house.slice(0, Math.max(4, 12 - people.length))
  if (!people.length && !fill.length) return null
  return (
    <div className="menu-rise [animation-delay:120ms]">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {people.map((s, i) => {
          const waited = now ? Math.max(0, Math.floor((now - s.since) / 1000)) : 0
          return (
            <Card
              key={`p${s.tc}-${s.since}-${i}`}
              name={s.name}
              sub={[s.guest ? "Guest" : s.username ? `@${s.username}` : null, s.city, s.title ? `${s.title}${s.level ? ` · Lv ${s.level}` : ""}` : null].filter(Boolean).join(" · ")}
              avatar={s.avatar_url}
              rating={s.guest ? "—" : String(s.rating)}
              tc={s.tc}
              badge={<span className="pick-tag">{s.guest || guest ? "Casual" : "Rated"}</span>}
              live={`● waiting ${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, "0")}`}
              onClick={() => onPick(s.tc)}
              disabled={disabled}
            />
          )
        })}
        {fill.map((h) => (
          <Card
            key={h.id}
            name={h.name}
            sub={[h.username ? `@${h.username}` : null, h.city].filter(Boolean).join(" · ")}
            avatar={h.avatar_url}
            rating={String(h.rating)}
            tc={h.tc}
            badge={
              <span className="pick-tag pick-house">
                <GIcon name="cpu" size={12} /> House Player
              </span>
            }
            onClick={() => onHouse(h)}
            disabled={disabled}
          />
        ))}
      </div>
      {!!fill.length && (
        <p className="mt-3 text-[12px] text-[var(--g-muted)]">
          House Players are computer opponents built to play like people, at every level. Games against them are {guest ? "casual for guests" : "rated as usual"}.
        </p>
      )}
    </div>
  )
}
