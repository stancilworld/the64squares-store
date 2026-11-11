"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { Avatar } from "@/components/play/avatar"
import { GAME_URL, SPEED_LABEL, TIME_CONTROLS, speedOf } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import type { PublicProfile } from "@/lib/profile-types"
import { useLobby, useMyProfile } from "./menu/screen"
import { GIcon } from "@/components/play-shell/icons"
import { OpponentBoard } from "./menu/opponent-board"
import { usePlayPass } from "./use-play-pass"

const TIPS = [
  "Develop your knights before your bishops.",
  "Castle early to keep your king safe.",
  "Every move, ask: what is my opponent threatening?",
  "Control the centre with pawns on e4 and d4.",
  "Premoves are on: plan your reply while they think.",
  "Short on time? Simple moves beat clever ones.",
]

const valid = (tc: string | null) => (tc && TIME_CONTROLS.some((t) => t.tc === tc) ? tc : null)

type HouseOffer = { opponent: PublicProfile & { rating: number; house: true; country?: string }; until: number }

// Seconds the notice shows before the game starts by itself.
const HOUSE_COUNTDOWN = 6

// Play online: choose a time control, then wait in the pool for a player of similar rating.
export function FindGame({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const meId = pass?.me.guest ? null : (pass?.me.id ?? null)
  const router = useRouter()
  const params = useSearchParams()
  const socket = useRef<Socket | null>(null)
  const [tc, setTc] = useState(() => valid(params.get("tc")) ?? "10+0")
  const autoStart = useRef(params.get("go") === "1")
  const [seeking, setSeeking] = useState<{ since: number; rating: number; provisional: boolean; tc: string } | null>(null)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<{ text: string; game?: string } | null>(null)
  const profile = useMyProfile(meId)
  const lobby = useLobby()
  // Nobody at this level found in time: one of the House Players is offered instead.
  const [offer, setOffer] = useState<HouseOffer | null>(null)
  const [starting, setStarting] = useState(false)

  const acceptHouse = useCallback(() => {
    setStarting(true)
    let answered = false
    // No answer (connection dropped, server busy): don't stay on "Starting…"; go back to
    // looking for a game, which brings a new offer.
    const giveUp = setTimeout(() => {
      if (answered) return
      setStarting(false)
      setOffer(null)
    }, 8000)
    socket.current?.emit("seek:house-accept", null, (res: { ok: boolean; game_id?: string }) => {
      answered = true
      clearTimeout(giveUp)
      if (res.ok && res.game_id) router.push(`/play/${res.game_id}`)
      else {
        setStarting(false)
        setOffer(null)
      }
    })
  }, [router])
  const keepWaiting = () => {
    socket.current?.emit("seek:house-later", null, () => {})
    setOffer(null)
  }

  const join = useCallback((which: string) => {
    socket.current?.emit("seek:join", { tc: which }, (res: { ok: boolean; error?: string; game_id?: string; rating?: number; provisional?: boolean }) => {
      if (res.ok) {
        const t = Date.now()
        setSeeking({ since: t, rating: res.rating ?? 1500, provisional: !!res.provisional, tc: which })
        setNow(t)
      } else if (res.error === "in-game") setError({ text: "You're already in a game.", game: res.game_id })
      else if (res.error === "fair-play-ban") setError({ text: "Your account is closed for rated games after a fair-play review." })
      else setError({ text: "Couldn't start the search. Please try again." })
    })
  }, [])

  useEffect(() => {
    if (!token) return
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("seek:paired", (p: { game_id: string }) => router.push(`/play/${p.game_id}`))
    s.on("seek:house", (o: { opponent: HouseOffer["opponent"] }) => setOffer({ opponent: o.opponent, until: Date.now() + HOUSE_COUNTDOWN * 1000 }))
    s.on("seek:house-withdrawn", () => setOffer(null))
    s.on("disconnect", () => {
      setSeeking(null)
      setOffer(null)
    })
    // Came from a quick-play button: start looking straight away.
    // (Once connected: in development React mounts twice and the first socket never connects.)
    s.once("connect", () => {
      if (!autoStart.current) return
      autoStart.current = false
      join(valid(params.get("tc")) ?? "10+0")
    })
    return () => {
      s.disconnect()
    }
  }, [token, router, join, params])

  useEffect(() => {
    if (!seeking) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [seeking])

  const play = () => {
    setError(null)
    join(tc)
  }
  // The offer starts by itself after the countdown, unless the player chose to keep waiting.
  useEffect(() => {
    if (!offer || starting) return
    const left = offer.until - Date.now()
    const t = setTimeout(acceptHouse, Math.max(0, left))
    return () => clearTimeout(t)
  }, [offer, starting, acceptHouse])

  const cancel = () => {
    socket.current?.emit("seek:leave", null, () => {})
    setSeeking(null)
    setOffer(null)
    router.replace("/play/online")
  }

  const ratings = Object.fromEntries((profile?.ratings ?? []).map((r) => [r.speed, `${r.rating}${r.provisional ? "?" : ""}`]))
  const [m, inc] = tc.split("+").map(Number)
  const speed = speedOf(m * 60000, inc * 1000)

  if (seeking && offer) {
    const o = offer.opponent
    const secs = Math.max(0, Math.ceil((offer.until - now) / 1000))
    return (
      <div className="menu-stage mx-auto flex min-h-[calc(100dvh-170px)] max-w-[560px] flex-col items-center justify-center py-6 text-center lg:min-h-[calc(100dvh-80px)]">
        <h1 className="menu-rise text-[24px] font-extrabold leading-tight sm:text-[28px]">No one at your level is online right now.</h1>
        <p className="g-muted menu-rise mt-2 text-[15px]">You&apos;ll play one of our House Players: computer opponents built to play like people.</p>
        <div className="menu-card menu-rise mt-8 flex w-full items-center gap-4 p-4 text-left">
          <Avatar url={o.avatar_url} name={o.display_name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-bold">{o.display_name}</p>
            <p className="g-muted truncate text-[13px]">
              @{o.username}
              {o.city ? ` · ${o.city}` : ""}
            </p>
            <p className="mt-1 text-[13px]">
              <span className="rounded-sm bg-[var(--g-panel-3)] px-2 py-0.5 font-bold text-[var(--g-accent)]">House Player</span>{" "}
              <span className="font-mono font-bold">{o.rating}</span>
            </p>
          </div>
        </div>
        <p className="g-muted mt-3 text-[13px]">Rated as usual: your rating and XP change like in any game.</p>
        <button type="button" disabled={starting} onClick={acceptHouse} className="menu-play mt-8 flex h-[56px] w-full max-w-[320px] items-center justify-center text-[18px] font-extrabold">
          {starting ? "Starting…" : `Play now (${secs})`}
        </button>
        <button type="button" disabled={starting} onClick={keepWaiting} className="g-btn mt-3 h-[46px] w-full max-w-[320px]">
          Keep waiting for a person
        </button>
      </div>
    )
  }

  if (seeking) {
    const waited = Math.max(0, Math.floor((now - seeking.since) / 1000))
    const [sm, si] = seeking.tc.split("+").map(Number)
    const sSpeed = speedOf(sm * 60000, si * 1000)
    const name = profile?.display_name ?? pass?.me.name ?? "You"
    return (
      <div className="menu-stage mx-auto flex min-h-[calc(100dvh-170px)] max-w-[640px] flex-col items-center justify-center py-6 text-center lg:min-h-[calc(100dvh-80px)]">
        <p className="menu-rise text-[12px] font-semibold text-[var(--g-muted)]">
          {SPEED_LABEL[sSpeed]} · {TIME_CONTROLS.find((t) => t.tc === seeking.tc)?.detail} · {pass?.me.guest ? "Casual" : "Rated"}
        </p>
        <div className="relative mt-16 grid h-[150px] w-[150px] place-items-center">
          <span className="mm-ring" />
          <span className="mm-ring [animation-delay:0.8s]" />
          <span className="mm-ring [animation-delay:1.6s]" />
          <span className="absolute inset-0 overflow-hidden rounded-full border border-[var(--g-accent)]/25 bg-[radial-gradient(circle,rgba(255,179,0,0.12),transparent_70%)]">
            <span className="mm-sweep" />
          </span>
          <span className="relative rounded-full ring-4 ring-[var(--g-accent)]/70">
            <Avatar url={profile?.avatar_url ?? null} name={name} size={96} className="[&>*]:!rounded-full" />
          </span>
        </div>
        <h1 className="mt-16 text-[28px] font-extrabold sm:text-[34px]">Finding an opponent…</h1>
        <p className="g-muted mt-2 text-[15px]">
          {pass?.me.guest ? "Guest game" : `Your rating ${seeking.rating}${seeking.provisional ? "?" : ""}`} ·{" "}
          <span className="font-mono">
            {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, "0")}
          </span>
        </p>
        <p className="mt-8 max-w-[34ch] rounded-xl bg-[var(--g-panel-2)] px-4 py-3 text-[14px]">
          <span className="font-bold text-[var(--g-accent)]">Tip · </span>
          {TIPS[Math.floor(waited / 6) % TIPS.length]}
        </p>
        <button type="button" className="g-btn mt-8 h-[48px] w-full max-w-[280px]" onClick={cancel}>
          Cancel
        </button>
        <p className="g-muted mt-3 text-[12px]">Keep this page open. The game starts the moment someone is found.</p>
      </div>
    )
  }

  return (
    <div className="menu-stage mx-auto flex max-w-[1240px] flex-col gap-8 pb-24 lg:pb-6">
      <div className="menu-rise">
        <h1 className="lobby-title">Choose an opponent</h1>
        <p className="g-muted mt-2 text-[14px]">
          Players waiting right now. Pick one to play them, or choose a time below and start.
          {lobby ? (
            <>
              {" "}
              <span className="text-[var(--g-good)]">●</span> {lobby.playing} {lobby.playing === 1 ? "game" : "games"} on now.
            </>
          ) : null}
        </p>
      </div>
      <OpponentBoard seekers={lobby?.seekers ?? []} onPick={(t) => join(t)} disabled={!token} />

      <section className="menu-rise [animation-delay:120ms]">
        <h2 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">Start your game</h2>
        <div className="start-bar">
          <div className="start-modes">
            <span className="start-mode" aria-current="true">
              <GIcon name="user" size={18} /> Human
            </span>
            <Link href="/play/computer" className="start-mode">
              <GIcon name="cpu" size={18} /> Computer
            </Link>
            <Link href="/play/friend" className="start-mode">
              <GIcon name="link" size={18} /> Friend
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <p className="start-kind">
              {pass?.me.guest ? (
                <>
                  Casual (guest) ·{" "}
                  <Link href="/account?next=/play/online" className="text-[var(--g-accent)] underline underline-offset-2">
                    sign up for a rating
                  </Link>
                </>
              ) : (
                <>
                  Rated · your {SPEED_LABEL[speed].toLowerCase()} rating {ratings[speed] ?? "1500? (new)"}
                </>
              )}
            </p>
            <div className="start-times" role="radiogroup" aria-label="Time control">
              {TIME_CONTROLS.map((t) => {
                const [min, inc] = t.tc.split("+")
                return (
                  <button key={t.tc} type="button" role="radio" aria-checked={tc === t.tc} onClick={() => setTc(t.tc)} className="start-time">
                    <span className="text-[22px] font-semibold leading-none">{min}</span>
                    <span className="mt-1 text-[11px] text-[var(--g-muted)]">{inc === "0" ? "min" : `+${inc}`}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <button type="button" onClick={play} disabled={!token} className="start-go">
            Start
            <br />
            game
          </button>
        </div>
        {error && (
          <p className="mt-3 text-center text-[14px] text-[var(--g-bad)] sm:text-left">
            {error.text}{" "}
            {error.game && (
              <Link href={`/play/${error.game}`} className="font-semibold underline underline-offset-2">
                Go to it
              </Link>
            )}
          </p>
        )}
      </section>
    </div>
  )
}
