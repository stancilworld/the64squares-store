"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GIcon } from "@/components/play-shell/icons"
import { GAME_URL } from "@/lib/game-types"
import type { FullProfile } from "@/lib/profile-types"

// Shared pieces of the Play menus (home screen and the set-up screens before a game).

export const ART = {
  hero: "/play-art/wK.webp",
  heroDark: "/play-art/bK.webp",
  online: "/play-art/wN.webp",
  computer: "/play-art/wR.webp",
  friend: "/play-art/wP.webp",
  tournaments: "/play-art/bQ.webp",
}

// Title row of a set-up screen: back to the Play home, the title and a line under it.
export function ScreenHeader({ title, subtitle, back = "/play", right }: { title: string; subtitle?: React.ReactNode; back?: string; right?: React.ReactNode }) {
  return (
    <div className="menu-rise flex items-start gap-3">
      <Link href={back} aria-label="Back" className="g-btn g-btn-ghost mt-0.5 !hidden !min-h-[42px] !w-[42px] shrink-0 !px-0 lg:!inline-flex">
        <GIcon name="back" size={20} />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="g-muted mt-1 text-[14px] sm:text-[15px]">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// The signed-in player's profile (level, ratings, results), for the menus.
export function useMyProfile(meId: string | null) {
  const [profile, setProfile] = useState<FullProfile | null>(null)
  useEffect(() => {
    if (!meId) return
    let live = true
    fetch(`${GAME_URL}/game/profiles/${encodeURIComponent(meId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.profile && setProfile(d.profile))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [meId])
  return profile
}

export type Lobby = { playing: number; online?: number; seeking?: Record<string, number>; house_ready?: number }

export function useLobby() {
  const [lobby, setLobby] = useState<Lobby | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch(`${GAME_URL}/game/lobby`)
        .then((r) => r.json())
        .then((d) => live && setLobby(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 20_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return lobby
}

// White, random or black, as three tokens.
export function ColourPick<T extends string>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  const opts = [
    ["w", "White", "/pieces/wood3d/wK.webp"],
    ["random", "Random", null],
    ["b", "Black", "/pieces/wood3d/bK.webp"],
  ] as const
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {opts.map(([v, label, img]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v as T)} className="menu-pick flex flex-col items-center gap-1 py-3">
          <span className="relative grid h-[56px] w-[56px] place-items-center">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="h-full w-full object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]" />
            ) : (
              <span className="relative h-[56px] w-[56px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pieces/wood3d/wK.webp" alt="" className="absolute left-[-4px] top-0 h-full w-full object-contain [clip-path:inset(0_50%_0_0)]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pieces/wood3d/bK.webp" alt="" className="absolute left-[4px] top-0 h-full w-full object-contain [clip-path:inset(0_0_0_50%)]" />
              </span>
            )}
          </span>
          <span className="text-[14px] font-bold">{label}</span>
        </button>
      ))}
    </div>
  )
}
