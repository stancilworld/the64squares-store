"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { Avatar } from "@/components/play/avatar"
import { GAME_URL, SPEED_LABEL, TIME_CONTROLS, speedOf } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import { ScreenHeader, useLobby, useMyProfile } from "./menu/screen"
import { TimeCards } from "./menu/time-cards"
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
    s.on("disconnect", () => setSeeking(null))
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
  const cancel = () => {
    socket.current?.emit("seek:leave", null, () => {})
    setSeeking(null)
    router.replace("/play/online")
  }

  const ratings = Object.fromEntries((profile?.ratings ?? []).map((r) => [r.speed, `${r.rating}${r.provisional ? "?" : ""}`]))
  const label = TIME_CONTROLS.find((t) => t.tc === tc)?.detail ?? tc
  const [m, inc] = tc.split("+").map(Number)
  const speed = speedOf(m * 60000, inc * 1000)

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
    <div className="menu-stage mx-auto flex max-w-[980px] flex-col gap-6 pb-24 lg:pb-4">
      <ScreenHeader
        title="Play Online"
        subtitle={
          <>
            Rated games against a player of similar strength.
            {lobby ? (
              <>
                {" "}
                <span className="text-[var(--g-good)]">●</span> {lobby.playing} {lobby.playing === 1 ? "game" : "games"} on now.
              </>
            ) : null}
          </>
        }
      />
      <TimeCards value={tc} onChange={setTc} ratings={ratings} seeking={lobby?.seeking} />
      <div className="fixed inset-x-0 bottom-[62px] z-20 bg-gradient-to-t from-[var(--g-bg)] via-[var(--g-bg)]/95 to-transparent px-3 pb-3 pt-6 lg:static lg:bg-none lg:p-0">
        <div className="mx-auto flex max-w-[980px] flex-col items-center gap-3 sm:flex-row">
          <button type="button" onClick={play} disabled={!token} className="menu-play flex h-[60px] w-full items-center justify-center gap-3 sm:w-[320px]">
            <span className="relative text-[20px] font-extrabold tracking-tight">Play {label}</span>
          </button>
          <p className="g-muted text-center text-[13px] sm:text-left">
            {pass?.me.guest ? (
              <>
                Playing as <b className="text-[var(--g-text)]">{pass.me.name}</b> · casual.{" "}
                <Link href="/account?next=/play/online" className="text-[var(--g-accent)] underline underline-offset-2">
                  Sign up
                </Link>{" "}
                for a rating.
              </>
            ) : (
              <>
                {SPEED_LABEL[speed]} · your rating {ratings[speed] ?? "1500? (new)"}
              </>
            )}
          </p>
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
      </div>
    </div>
  )
}
