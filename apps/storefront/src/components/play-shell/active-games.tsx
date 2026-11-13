"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { SPEED_LABEL, speedOf, tcText } from "@/lib/game-types"
import { type LiveGame, type LiveLobby, type LiveTournament, lobbyHref, tournamentHref, useLiveNow, whenText } from "@/lib/chess/live-now"
import type { PlayPass } from "@/lib/play"
import { GIcon } from "./icons"

// "Live now": your game in progress (to get back into it), the tournaments you've joined, and
// what's on now or this week, from a button in the Play menu.

const FORMAT: Record<string, string> = { arena: "Arena", swiss: "Swiss", round_robin: "Round robin", knockout: "Knockout" }

const Section = ({ title }: { title: string }) => <p className="px-5 pb-1 pt-3 text-[12px] font-semibold text-[var(--g-muted)]">{title}</p>

function GameRow({ g }: { g: LiveGame }) {
  return (
    <Link href={`/play/${g.id}`} className="mx-2 flex items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--g-accent)_14%,transparent)] px-3 py-3 hover:bg-[color-mix(in_srgb,var(--g-accent)_22%,transparent)]">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--g-panel-3)]">
        <GIcon name="bolt" size={18} className="text-[var(--g-accent)]" />
        <span className="live-dot absolute -right-1 -top-1" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">
          {g.colour ? `vs ${g.opponent}` : g.opponent}
          {g.opponent_rating ? <span className="g-muted font-normal"> ({g.opponent_rating})</span> : null}
        </span>
        <span className="g-muted block text-[12px]">
          {g.initial_ms ? `${SPEED_LABEL[speedOf(g.initial_ms, g.increment_ms)]} ${tcText(g.initial_ms, g.increment_ms)} · ` : ""}
          {g.mode === "arena" ? "Tournament game" : g.mode === "friend" ? "With a friend" : "Your clock may be running"}
        </span>
      </span>
      <span className="text-[13px] font-extrabold text-[var(--g-accent)]">Return</span>
    </Link>
  )
}

const LOBBY_COLOUR: Record<string, string> = { arena: "#ffb300", swiss: "#35c6d4", knockout: "#ff5d5d", round_robin: "#9b8cff" }

function LobbyRow({ t }: { t: LiveLobby }) {
  const c = LOBBY_COLOUR[t.format] ?? "var(--g-accent)"
  return (
    <Link href={lobbyHref(t)} className="mx-2 flex items-center gap-3 rounded-lg px-3 py-3" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-black" style={{ background: c }}>
        <GIcon name="trophy" size={19} />
        <span className="live-dot absolute -right-1 -top-1" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{t.title}</span>
        <span className="g-muted block truncate text-[12px]">
          {FORMAT[t.format] ?? t.format} {t.time_control} · {t.moderating ? "You're moderating" : "You're playing"}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-extrabold" style={{ color: c }}>
        Enter lobby
      </span>
    </Link>
  )
}

function EventRow({ t, joined }: { t: LiveTournament; joined: boolean }) {
  const now = whenText(t) === "On now"
  return (
    <Link href={tournamentHref(t)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--g-panel-2)]">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${now ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel-3)] text-[var(--g-accent)]"}`}>
        <GIcon name="trophy" size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{t.title}</span>
        <span className="g-muted block truncate text-[12px]">
          {FORMAT[t.format] ?? t.format} {t.time_control} · {t.mode === "online" ? "Online" : "At the venue"}
          {joined ? " · You're in" : typeof t.players === "number" && t.players > 0 ? ` · ${t.players} joined` : ""}
        </span>
      </span>
      <span className={`shrink-0 text-right text-[12px] font-bold ${now ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}>{whenText(t)}</span>
    </Link>
  )
}

export function ActiveGames({ pass, compact = false, folded = false }: { pass: PlayPass | null; compact?: boolean; folded?: boolean }) {
  const data = useLiveNow(pass)
  const path = usePathname()
  // Open on the page it was opened on; changing page closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === path
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Placed against the window, beside the button: the side menu scrolls, which would clip it.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const games = data?.games ?? []
  const lobbies = data?.lobbies ?? []
  const mine = (data?.tournaments.length ?? 0) + games.length + lobbies.length
  const playing = games.length > 0
  const total = mine + (data?.events.length ?? 0)

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null)
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpenAt(null)
    window.addEventListener("keydown", key)
    window.addEventListener("mousedown", click)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("mousedown", click)
    }
  }, [open])

  const badge = mine > 0 && (
    <span
      className={`${compact ? "absolute right-0.5 top-0.5" : folded ? "absolute right-1 top-0.5 !h-[17px] !min-w-[17px] !text-[10px]" : ""} grid h-[20px] min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-extrabold ${
        playing ? "bg-[var(--g-bad)] text-white" : "bg-[var(--g-accent)] text-black"
      }`}
    >
      {mine}
    </span>
  )

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Live now${playing ? ": your game is on" : mine ? `: ${mine}` : ""}`}
        title={folded ? "Live now" : undefined}
        ref={button}
        onClick={() => {
          const r = button.current?.getBoundingClientRect()
          if (r) setAt({ left: r.right + 12, top: Math.max(12, Math.min(r.top, window.innerHeight - 560)) })
          setOpenAt(open ? null : path)
        }}
        className={
          compact
            ? "relative flex h-10 w-10 items-center justify-center rounded-lg text-[var(--g-muted)]"
            : folded
              ? "relative flex h-11 w-full items-center justify-center rounded-lg text-[var(--g-muted)] transition hover:bg-[var(--g-panel)] hover:text-white short:h-10"
              : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-[var(--g-muted)] transition hover:bg-[var(--g-panel)] hover:text-white short:py-2"
        }
      >
        <span className="relative">
          <GIcon name="board" size={22} />
          {playing && <span className="live-dot absolute -right-1 -top-1" aria-hidden="true" />}
        </span>
        {!compact && !folded && <span className="flex-1">Live now</span>}
        {badge}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Live now"
          className={`active-pop fixed z-[60] w-[min(92vw,390px)] overflow-hidden rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] shadow-2xl ${
            compact ? "right-2 top-[56px]" : ""
          }`}
          style={!compact && at ? { left: at.left, top: at.top } : undefined}
        >
          <div className="flex items-center justify-between border-b border-[var(--g-line)] px-5 py-4">
            <p className="text-[18px] font-bold">Live now</p>
            <Link href="/play/tournaments" className="text-[13px] font-semibold text-[var(--g-muted)] hover:text-white">
              All tournaments ›
            </Link>
          </div>

          {!data ? (
            <p className="g-muted px-5 py-8 text-center text-[14px]">Loading…</p>
          ) : total === 0 ? (
            <div className="flex flex-col items-center px-5 pb-5 pt-2">
              {/* A starburst, like a speech bubble shouting "play!" */}
              <div className="relative grid aspect-square w-[240px] place-items-center">
                <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  <polygon
                    fill="var(--g-accent)"
                    points="100,8 116,52 158,22 140,68 192,62 150,96 196,124 142,124 166,172 120,146 112,196 92,150 58,186 66,138 14,156 48,116 4,92 54,84 26,40 76,60"
                  />
                </svg>
                <p className="relative max-w-[150px] -rotate-6 text-center text-[14px] font-bold leading-snug text-black">
                  Nothing on right now. Start a game, or invite a friend.
                </p>
              </div>
              <Link href="/play/online" className="g-btn g-btn-primary mt-2 w-full">
                New game
              </Link>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto pb-3">
              {games.length > 0 && (
                <>
                  <Section title={games.length === 1 ? "Your game" : "Your games"} />
                  <div className="flex flex-col gap-2">
                    {games.map((g) => (
                      <GameRow key={g.id} g={g} />
                    ))}
                  </div>
                </>
              )}
              {lobbies.length > 0 && (
                <>
                  <Section title={lobbies.length === 1 ? "Lobby open" : "Lobbies open"} />
                  <div className="flex flex-col gap-2">
                    {lobbies.map((t) => (
                      <LobbyRow key={t.id} t={t} />
                    ))}
                  </div>
                </>
              )}
              {data.tournaments.length > 0 && (
                <>
                  <Section title="Your tournaments" />
                  {data.tournaments.map((t) => (
                    <EventRow key={t.id} t={t} joined />
                  ))}
                </>
              )}
              {data.events.length > 0 && (
                <>
                  <Section title="On now and this week" />
                  {data.events.map((t) => (
                    <EventRow key={t.id} t={t} joined={false} />
                  ))}
                </>
              )}
              {games.length === 0 && (
                <div className="px-5 pt-3">
                  <Link href="/play/online" className="g-btn g-btn-primary w-full">
                    New game
                  </Link>
                </div>
              )}
              {!pass && (
                <p className="g-muted px-5 pt-3 text-center text-[12px]">
                  <Link href="/account?next=/play" className="font-semibold text-white underline">
                    Sign in
                  </Link>{" "}
                  to see your games on any device.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
