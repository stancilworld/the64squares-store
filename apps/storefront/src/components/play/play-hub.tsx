"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Avatar, LevelBadge } from "@/components/play/avatar"
import { GIcon } from "@/components/play-shell/icons"
import { GAME_URL, tcText } from "@/lib/game-types"
import { TITLE_COLOURS } from "@/lib/profile-types"
import { ART, useLobby, useMyProfile } from "./menu/screen"

type Live = { id: string; white_name: string | null; black_name: string | null; initial_ms: number; increment_ms: number }

const QUICK = [
  { tc: "3+2", label: "3 | 2", speed: "Blitz" },
  { tc: "5+0", label: "5 min", speed: "Blitz" },
  { tc: "10+0", label: "10 min", speed: "Rapid" },
]

const MODES = [
  { href: "/play/online", art: ART.online, title: "Play Online", text: "Rated games against a player of your level", glow: "rgba(230,197,127,0.22)" },
  { href: "/play/computer", art: ART.computer, title: "Vs Computer", text: "Eight bots, beginner to master", glow: "rgba(120,190,255,0.16)" },
  { href: "/play/friend", art: ART.friend, title: "Play a Friend", text: "Send a link on WhatsApp", glow: "rgba(110,215,150,0.16)" },
  { href: "/play/tournaments", art: ART.tournaments, title: "Tournaments", text: "Free online arenas", glow: "rgba(200,140,230,0.18)" },
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

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? "Late-night chess" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

// The Play home screen: a big Play button, the player's level and ratings, and the ways to play.
export function PlayHub({ meId, myName, signedIn }: { meId: string | null; myName: string | null; signedIn: boolean }) {
  const [live, setLive] = useState<Live | null>(null)
  const [hello, setHello] = useState("Welcome back")
  const profile = useMyProfile(signedIn ? meId : null)
  const lobby = useLobby()

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
    <div className="menu-stage mx-auto flex max-w-[1180px] flex-col gap-4 sm:gap-5">
      {live && (
        <Link
          href={`/play/${live.id}`}
          className="menu-rise flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#b23b31] to-[#8f2d25] px-5 py-3.5 text-white shadow-[0_4px_0_#5c1d18]"
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

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Hero */}
        <section className="menu-hero menu-rise min-h-[300px] p-6 sm:min-h-[340px] sm:p-9 lg:col-start-1 lg:row-start-1" aria-label="Quick play">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ART.hero}
            alt=""
            className="menu-hero-art pointer-events-none absolute right-[-3%] top-[4%] z-[1] w-[34%] max-w-[330px] sm:bottom-[-4%] sm:right-[2%] sm:top-auto sm:w-[40%]"
          />
          <div className="relative z-[2] flex h-full max-w-[460px] flex-col">
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--g-gold)]">The 64 Squares · Play</p>
            <h1 className="font-display mt-3 max-w-[70%] text-[34px] leading-[1.05] sm:max-w-none sm:text-[48px]">
              {hello},
              <br />
              <span className="text-[var(--g-gold)]">{first}.</span>
            </h1>
            <p className="g-muted mt-3 max-w-[30ch] text-[15px] sm:text-[16px]">
              {lobby && (lobby.online || lobby.playing) ? (
                <>
                  <span className="text-[#5fd07a]">●</span> {lobby.online ? `${lobby.online} online · ` : ""}
                  {lobby.playing} {lobby.playing === 1 ? "game" : "games"} on now
                </>
              ) : (
                "Find an opponent in seconds."
              )}
            </p>
            <div className="mt-auto pt-6">
              <Link href="/play/online?tc=10%2B0&go=1" className="menu-play flex w-full max-w-[340px] items-center justify-between px-6 py-4">
                <span className="relative">
                  <span className="block text-[24px] font-black uppercase leading-none tracking-wide sm:text-[28px]">Play</span>
                  <span className="mt-1 block text-[13px] font-semibold opacity-75">Rapid · 10 min{signedIn ? " · rated" : ""}</span>
                </span>
                <span className="relative grid h-11 w-11 place-items-center rounded-full bg-[#1d1408]/15">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M8 5.5v13l10.5-6.5z" />
                  </svg>
                </span>
              </Link>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <Link
                    key={q.tc}
                    href={`/play/online?tc=${encodeURIComponent(q.tc)}&go=1`}
                    className="rounded-full border border-white/10 bg-black/25 px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur hover:border-[var(--g-gold)]/60"
                  >
                    {q.label}
                    <span className="g-muted ml-1.5 text-[11px] font-medium">{q.speed}</span>
                  </Link>
                ))}
                <Link href="/play/online" className="rounded-full px-2 py-1.5 text-[13px] font-semibold text-[var(--g-gold)] hover:underline">
                  More…
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Player card */}
        <section className="menu-card menu-rise order-3 flex flex-col p-5 [animation-delay:80ms] lg:order-none lg:col-start-2 lg:row-start-1" aria-label="Your profile">
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
                    <div key={s} className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
                      <p className="g-muted text-[11px] font-bold uppercase tracking-wider">{s}</p>
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
                  <b className="text-[#5fd07a]">{people.wins}</b> wins · <b className="text-[var(--g-text)]">{people.draws}</b> draws ·{" "}
                  <b className="text-[#ff8a7d]">{people.losses}</b> losses
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
                  <Link href="/play/profile" className="shrink-0 text-[13px] font-bold text-[var(--g-gold)] hover:underline">
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

      {/* Modes */}
      <nav aria-label="Ways to play" className="order-2 grid grid-cols-2 gap-3 sm:gap-4 lg:order-none lg:col-span-2 lg:grid-cols-4">
        {MODES.map((m, i) => (
          <Link
            key={m.href}
            href={m.href}
            className="menu-tile menu-rise flex min-h-[150px] flex-col p-4 sm:min-h-[190px] sm:p-5"
            style={{ animationDelay: `${120 + i * 60}ms`, ["--tile-glow" as string]: m.glow }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.art} alt="" className="menu-tile-art" />
            <span className="relative z-[1] max-w-[78%] text-[17px] font-extrabold leading-tight sm:text-[21px]">{m.title}</span>
            <span className="g-muted relative z-[1] mt-1 max-w-[62%] text-[12px] leading-snug sm:text-[13px]">{m.text}</span>
            <span className="relative z-[1] mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-bold text-[var(--g-gold)]">
              Start →
            </span>
          </Link>
        ))}
      </nav>

      <div className="menu-rise order-4 grid grid-cols-2 gap-2 [animation-delay:380ms] sm:grid-cols-4 sm:gap-3 lg:order-none lg:col-span-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={signedIn || l.href === "/play/leaderboard" ? l.href : `/account?next=${l.href}`} className="g-btn justify-start !rounded-xl !px-4 text-[14px]">
            <GIcon name={l.icon} size={19} className="text-[var(--g-gold)]" />
            {l.label}
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}
