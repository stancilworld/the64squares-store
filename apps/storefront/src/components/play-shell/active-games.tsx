"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { GAME_URL, SPEED_LABEL, speedOf, tcText } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import { GIcon } from "./icons"

// "Active games": the games the player is in right now and the tournaments they've joined,
// from a button in the Play menu (with a count), in a small panel.

type ActiveGame = {
  id: string
  mode: string
  colour: "w" | "b"
  opponent: string
  opponent_rating: number | null
  initial_ms: number
  increment_ms: number
  tournament_id: string | null
}
type ActiveTournament = { id: string; title: string; handle: string; format: string; mode: "online" | "offline"; time_control: string; starts_at: string; ends_at: string | null }
type Active = { games: ActiveGame[]; tournaments: ActiveTournament[] }

const FORMAT: Record<string, string> = { arena: "Arena", swiss: "Swiss", round_robin: "Round robin", knockout: "Knockout" }

const when = (t: ActiveTournament) => {
  const start = new Date(t.starts_at).getTime()
  if (start <= Date.now()) return "On now"
  const d = new Date(start)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? `Today, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export function useActive(pass: PlayPass | null) {
  const [data, setData] = useState<Active | null>(null)
  const load = useCallback(() => {
    if (!pass) return
    fetch(`${GAME_URL}/game/me/active`, { headers: { authorization: `Bearer ${pass.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Active | null) => d && setData(d))
      .catch(() => {})
  }, [pass])
  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])
  return { data, load }
}

export function ActiveGames({ pass, compact = false, folded = false }: { pass: PlayPass | null; compact?: boolean; folded?: boolean }) {
  const { data, load } = useActive(pass)
  const path = usePathname()
  // Open on the page it was opened on; changing page closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === path
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? path : null)
  const box = useRef<HTMLDivElement>(null)
  const count = (data?.games.length ?? 0) + (data?.tournaments.length ?? 0)

  // Closes on Escape or a click outside.
  useEffect(() => {
    if (!open) return
    load()
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null)
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpenAt(null)
    window.addEventListener("keydown", key)
    window.addEventListener("mousedown", click)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("mousedown", click)
    }
  }, [open, load])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Active games${count ? `: ${count}` : ""}`}
        title={folded ? "Active games" : undefined}
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? "relative flex h-10 w-10 items-center justify-center rounded-lg text-[var(--g-muted)]"
            : folded
              ? "relative flex h-11 w-full items-center justify-center rounded-lg text-[var(--g-muted)] transition hover:bg-[var(--g-panel)] hover:text-white"
              : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-[var(--g-muted)] transition hover:bg-[var(--g-panel)] hover:text-white"
        }
      >
        <GIcon name="board" size={compact ? 22 : 22} />
        {!compact && !folded && <span className="flex-1">Active games</span>}
        {count > 0 && (
          <span className={`${compact ? "absolute right-0.5 top-0.5" : folded ? "absolute right-1 top-0.5 !h-[17px] !min-w-[17px] !text-[10px]" : ""} grid h-[20px] min-w-[20px] place-items-center rounded-full bg-[var(--g-accent)] px-1.5 text-[11px] font-extrabold text-black`}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Active games"
          className={`active-pop z-[60] w-[min(92vw,380px)] overflow-hidden rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] shadow-2xl ${
            compact ? "fixed right-2 top-[56px]" : "absolute left-full top-0 ml-3"
          }`}
        >
          <div className="flex items-center justify-between border-b border-[var(--g-line)] px-5 py-4">
            <p className="text-[18px] font-bold">Active games</p>
            <Link href="/play/history" className="text-[13px] font-semibold text-[var(--g-muted)] hover:text-white">
              All my games ›
            </Link>
          </div>

          {!pass ? (
            <div className="px-5 py-6 text-center">
              <p className="text-[14px]">Sign in to see your games in progress and the tournaments you&apos;ve joined, from any device.</p>
              <Link href="/account?next=/play" className="g-btn g-btn-primary mt-4 w-full">
                Sign in
              </Link>
            </div>
          ) : !data ? (
            <p className="g-muted px-5 py-8 text-center text-[14px]">Loading…</p>
          ) : count === 0 ? (
            <div className="flex flex-col items-center px-5 pb-5 pt-2">
              {/* A starburst, like a speech bubble shouting "play!" */}
              <div className="relative grid aspect-square w-[260px] place-items-center">
                <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  <polygon
                    fill="var(--g-accent)"
                    points="100,8 116,52 158,22 140,68 192,62 150,96 196,124 142,124 166,172 120,146 112,196 92,150 58,186 66,138 14,156 48,116 4,92 54,84 26,40 76,60"
                  />
                </svg>
                <p className="relative max-w-[150px] -rotate-6 text-center text-[14px] font-bold leading-snug text-black">
                  Start a new game and play for your rating, or invite a friend.
                </p>
              </div>
              <Link href="/play/online" className="g-btn g-btn-primary mt-2 w-full">
                New game
              </Link>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {data.games.length > 0 && <p className="px-5 pb-1 pt-2 text-[12px] font-semibold text-[var(--g-muted)]">Playing now</p>}
              {data.games.map((g) => (
                <Link key={g.id} href={`/play/${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--g-panel-2)]">
                  <span className={`h-9 w-9 shrink-0 rounded-md border border-[var(--g-line)] ${g.colour === "w" ? "bg-[#f1ede4]" : "bg-[#2a2a2a]"}`} aria-label={g.colour === "w" ? "You play White" : "You play Black"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {g.opponent}
                      {g.opponent_rating ? <span className="g-muted font-normal"> ({g.opponent_rating})</span> : null}
                    </span>
                    <span className="g-muted block text-[12px]">
                      {g.initial_ms ? `${SPEED_LABEL[speedOf(g.initial_ms, g.increment_ms)]} ${tcText(g.initial_ms, g.increment_ms)}` : "No clock"}
                      {g.mode === "arena" ? " · Tournament game" : g.mode === "friend" ? " · With a friend" : ""}
                    </span>
                  </span>
                  <span className="text-[13px] font-bold text-[var(--g-accent)]">Open</span>
                </Link>
              ))}
              {data.tournaments.length > 0 && <p className="px-5 pb-1 pt-3 text-[12px] font-semibold text-[var(--g-muted)]">Tournaments you&apos;ve joined</p>}
              {data.tournaments.map((t) => (
                <Link
                  key={t.id}
                  href={t.mode === "online" && t.format === "arena" ? `/play/arena/${t.handle}` : `/tournaments/${t.handle}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--g-panel-2)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--g-panel-3)] text-[var(--g-accent)]">
                    <GIcon name="trophy" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{t.title}</span>
                    <span className="g-muted block text-[12px]">
                      {FORMAT[t.format] ?? t.format} {t.time_control} · {t.mode === "online" ? "Online" : "At the venue"}
                    </span>
                  </span>
                  <span className={`text-right text-[12px] font-bold ${when(t) === "On now" ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}>{when(t)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
