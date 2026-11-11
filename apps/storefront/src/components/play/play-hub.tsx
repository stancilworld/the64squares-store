"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Avatar, LevelBadge } from "@/components/play/avatar"
import { GIcon } from "@/components/play-shell/icons"
import { GAME_URL, tcText } from "@/lib/game-types"
import { MiniBoard } from "@/components/chess/mini-board"
import { positionAt, puzzleApi } from "@/lib/puzzles"
import { TITLE_COLOURS } from "@/lib/profile-types"
import { ChessStage } from "./chess-stage"
import { DailyMissions } from "./menu/missions"
import { ART, useLobby, useMyProfile } from "./menu/screen"

type Live = { id: string; white_name: string | null; black_name: string | null; initial_ms: number; increment_ms: number }

const MODES = [
  { href: "/play/computer", art: ART.computer, title: "Computer", text: "Eight opponents, beginner to master" },
  { href: "/play/puzzles", art: ART.heroDark, title: "Puzzles", text: "Daily puzzle, trainer and Puzzle Rush" },
  { href: "/play/friend", art: ART.friend, title: "Play a friend", text: "Send a link on WhatsApp" },
  { href: "/play/tournaments", art: ART.tournaments, title: "Tournaments", text: "Free online arenas" },
]

const LINKS = [
  { href: "/play/friends", icon: "friend", label: "Friends" },
  { href: "/play/leaderboard", icon: "chart", label: "Leaderboard" },
  { href: "/play/history", icon: "history", label: "My games" },
  { href: "/play/profile", icon: "user", label: "Profile" },
]

const RANKS = [
  { from: 5, title: "Knight" },
  { from: 10, title: "Bishop" },
  { from: 15, title: "Rook" },
  { from: 20, title: "Queen" },
  { from: 30, title: "King" },
  { from: 40, title: "Grandmaster" },
]
const nextTitle = (level: number) => RANKS.find((r) => r.from > level) ?? null

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? "Late-night chess" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

// The Play home screen: a big Play button, the player's level and ratings, and the ways to play.
export function PlayHub({ meId, myName, signedIn, token }: { meId: string | null; myName: string | null; signedIn: boolean; token: string | null }) {
  const [live, setLive] = useState<Live | null>(null)
  const [hello, setHello] = useState("Welcome back")
  const profile = useMyProfile(signedIn ? meId : null)
  const lobby = useLobby()
  const [daily, setDaily] = useState<{ fen: string; white: boolean; marks: string[] } | null>(null)

  useEffect(() => {
    let on = true
    puzzleApi
      .daily(null)
      .then((d) => {
        const pos = positionAt(d.puzzle, 1)
        if (on) setDaily({ fen: pos.fen, white: pos.chess.turn() === "w", marks: pos.last ? [pos.last.from, pos.last.to] : [] })
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setHello(greeting()), 0)
    if (!meId) return () => clearTimeout(t)
    void fetch(`${GAME_URL}/game/players/${meId}/live`)
      .then((r) => r.json())
      .then((d) => setLive(d.games?.[0] ?? null))
      .catch(() => {})
    return () => clearTimeout(t)
  }, [meId])

  const name = profile?.display_name ?? myName ?? "Guest"
  const first = name.split(/\s+/)[0]
  const level = profile?.level
  const pct = level ? Math.min(100, Math.round((level.into / Math.max(1, level.needed)) * 100)) : 0
  const ratings = profile?.ratings ?? []
  const rating = (s: string) => ratings.find((r) => r.speed === s)
  const people = profile?.stats.people

  return (
    <div className="menu-stage mx-auto flex max-w-[1180px] flex-col gap-3 sm:gap-4">
      {live && (
        <Link
          href={`/play/${live.id}`}
          className="menu-rise flex items-center justify-between gap-3 rounded-lg bg-[#c8372b] px-5 py-3.5 text-white"
        >
          <span className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
            </span>
            <span>
              <span className="block text-[15px] font-bold">Your game is still on</span>
              <span className="block text-[13px] text-white/85">
                {live.white_name} vs {live.black_name} · {tcText(live.initial_ms, live.increment_ms)}
              </span>
            </span>
          </span>
          <span className="rounded-lg bg-white/15 px-3 py-1.5 text-[14px] font-bold">Return →</span>
        </Link>
      )}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        {/* Play online: one button (all the time controls are on the Online screen) and a
            chess scene that answers the mouse. */}
        <section className="menu-hero menu-rise grid overflow-hidden lg:col-start-1 lg:row-start-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" aria-label="Play online">
          <div className="order-2 flex flex-col justify-center p-5 sm:order-1 sm:p-7">
            <h1 className="font-display text-[26px] leading-[1.05] sm:text-[34px]">
              {hello}, {first}.
            </h1>
            <p className="g-muted mt-2 flex items-center gap-2 text-[14px] font-medium">
              {lobby && (lobby.online || lobby.playing) ? (
                <>
                  <span className="h-2 w-2 bg-[var(--g-good)]" />
                  {lobby.online ? `${lobby.online} online, ` : ""}
                  {lobby.playing} {lobby.playing === 1 ? "game" : "games"} on now
                </>
              ) : (
                "Bullet, blitz, rapid or classical, against players at your level."
              )}
            </p>
            <Link href="/play/online" className="menu-play mt-5 flex h-[56px] w-full items-center justify-center gap-3 text-[18px] font-extrabold tracking-tight">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M8 5.5v13l10.5-6.5z" />
              </svg>
              Play online
            </Link>
            <p className="g-muted mt-2.5 text-center text-[13px]">{signedIn ? "Rated games count for your rating and XP." : "Play as a guest, or sign up to get a rating."}</p>
          </div>
          <ChessStage href="/play/online" label="Play online" className="order-1 h-[210px] !rounded-none sm:order-2 sm:h-auto sm:min-h-[280px] lg:min-h-[300px]" />
        </section>

        {/* Player card */}
        <div className="order-3 flex flex-col gap-3 sm:gap-4 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <section className="menu-card menu-rise flex flex-col p-5 [animation-delay:80ms]" aria-label="Your profile">
          <div className="flex items-center gap-3">
            <Avatar url={profile?.avatar_url ?? null} name={name} size={58} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-bold">{name}</p>
              {level ? (
                <p className="text-[13px] font-semibold" style={{ color: TITLE_COLOURS[level.title] }}>
                  {level.title}
                </p>
              ) : (
                <p className="g-muted text-[13px]">{signedIn ? "Loading…" : "Playing as a guest"}</p>
              )}
            </div>
            {level && <LevelBadge level={level} compact />}
          </div>

          {signedIn ? (
            <>
              <div className="mt-4">
                <div className="flex justify-between text-[12px] font-semibold">
                  <span className="g-muted">Level {level?.level ?? 1}</span>
                  <span className="g-muted">
                    {level ? `${level.into} / ${level.needed} XP` : "…"}
                  </span>
                </div>
                <div className="menu-xp mt-1.5 h-[10px] overflow-hidden rounded-full">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["bullet", "blitz", "rapid"] as const).map((s) => {
                  const r = rating(s)
                  return (
                    <div key={s} className="rounded-md bg-[var(--g-panel-2)] px-2 py-2.5 text-center">
                      <p className="g-muted text-[12px] font-semibold capitalize">{s}</p>
                      <p className="mt-0.5 font-mono text-[18px] font-bold">
                        {r ? r.rating : "—"}
                        {r?.provisional ? <span className="g-muted text-[12px]">?</span> : null}
                      </p>
                    </div>
                  )
                })}
              </div>
              {people && people.games > 0 && (
                <p className="g-muted mt-3 text-center text-[13px]">
                  <b className="text-[var(--g-good)]">{people.wins}</b> wins · <b className="text-[var(--g-text)]">{people.draws}</b> draws ·{" "}
                  <b className="text-[var(--g-bad)]">{people.losses}</b> losses
                </p>
              )}
              {level && (
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 pt-4">
                  <span className="g-muted text-[13px]">
                    {nextTitle(level.level) ? (
                      <>
                        Next rank: <b style={{ color: TITLE_COLOURS[nextTitle(level.level)!.title] }}>{nextTitle(level.level)!.title}</b> at level {nextTitle(level.level)!.from}
                      </>
                    ) : (
                      "Top rank reached"
                    )}
                  </span>
                  <Link href="/play/profile" className="shrink-0 text-[13px] font-bold text-[var(--g-accent)] hover:underline">
                    Profile →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 flex flex-1 flex-col">
              <p className="g-muted text-[14px]">Create a free account to earn a rating and XP, keep your games, add friends and join tournaments.</p>
              <Link href="/account?next=/play" className="g-btn g-btn-primary mt-auto w-full">
                Sign up free
              </Link>
            </div>
          )}
        </section>

        <Link href="/play/puzzles/daily" className="menu-tile menu-rise flex flex-1 flex-col p-5 [animation-delay:120ms]">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[18px] font-extrabold leading-tight tracking-tight">Puzzle of the day</span>
            <span className="text-[14px] font-bold text-[var(--g-accent)]">Solve it</span>
          </span>
          <MiniBoard fen={daily?.fen ?? START} flip={daily ? !daily.white : false} marks={daily?.marks ?? []} className="mx-auto mt-4 w-full max-w-[300px]" />
          <span className="g-muted mt-3 flex items-center gap-2 text-[14px] font-medium">
            {daily && <span className={`h-3 w-3 border border-white/40 ${daily.white ? "bg-white" : "bg-black"}`} />}
            {daily ? `${daily.white ? "White" : "Black"} to move` : "A new puzzle every day"}
          </span>
        </Link>
        </div>

      {/* Modes */}
      <nav aria-label="Ways to play" className="order-2 grid grid-cols-2 gap-3 sm:gap-4 lg:order-none lg:col-start-1 lg:row-start-2">
        {MODES.map((m, i) => (
          <Link key={m.href} href={m.href} className="menu-tile menu-rise flex min-h-[140px] flex-col p-4 sm:min-h-[170px] sm:p-5" style={{ animationDelay: `${80 + i * 40}ms` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.art} alt="" className="menu-tile-art" />
            <span className="relative z-[1] max-w-[78%] text-[18px] font-extrabold leading-tight tracking-tight sm:text-[22px]">{m.title}</span>
            <span className="g-muted relative z-[1] mt-1.5 max-w-[58%] text-[13px] leading-snug sm:text-[14px]">{m.text}</span>
          </Link>
        ))}
      </nav>

      {signedIn && (
        <div className="order-3 lg:order-none lg:col-span-2">
          <DailyMissions token={token} signedIn={signedIn} />
        </div>
      )}

      <div className="menu-rise order-4 grid grid-cols-2 gap-2 [animation-delay:380ms] sm:grid-cols-4 sm:gap-3 lg:order-none lg:col-span-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={signedIn || l.href === "/play/leaderboard" ? l.href : `/account?next=${l.href}`} className="g-btn g-btn-ghost justify-start !px-4 text-[14px]">
            <GIcon name={l.icon} size={19} className="text-[var(--g-accent)]" />
            {l.label}
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}
