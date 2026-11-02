"use client"

import Link from "next/link"
import { PanelHeader } from "@/components/play-shell/nav"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { GAME_URL, SPEED_LABEL, type Speed, speedOf, TIME_CONTROLS } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import { TimeControlPicker } from "./time-control-picker"
import { usePlayPass } from "./use-play-pass"

type MyRating = { speed: Speed; rating: number; provisional: boolean }

// Play online: wait in the pool for a player of similar rating.
export function FindGame({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const meId = pass?.me.guest ? null : (pass?.me.id ?? null)
  const router = useRouter()
  const socket = useRef<Socket | null>(null)
  const [tc, setTc] = useState("10+0")
  const [seeking, setSeeking] = useState<{ since: number; rating: number; provisional: boolean } | null>(null)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<{ text: string; game?: string } | null>(null)
  const [ratings, setRatings] = useState<MyRating[]>([])
  const [lobby, setLobby] = useState<{ playing: number } | null>(null)

  useEffect(() => {
    void fetch(`${GAME_URL}/game/lobby`)
      .then((r) => r.json())
      .then(setLobby)
      .catch(() => {})
    if (meId)
      void fetch(`${GAME_URL}/game/players/${meId}/ratings`)
        .then((r) => r.json())
        .then((d) => setRatings(d.ratings ?? []))
        .catch(() => {})
  }, [meId])

  useEffect(() => {
    if (!token) return
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("seek:paired", (p: { game_id: string }) => router.push(`/play/${p.game_id}`))
    s.on("disconnect", () => setSeeking(null))
    return () => {
      s.disconnect()
    }
  }, [token, router])

  useEffect(() => {
    if (!seeking) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [seeking])

  const play = () => {
    setError(null)
    socket.current?.emit("seek:join", { tc }, (res: { ok: boolean; error?: string; game_id?: string; rating?: number; provisional?: boolean }) => {
      if (res.ok) {
        const t = Date.now()
        setSeeking({ since: t, rating: res.rating ?? 1500, provisional: !!res.provisional })
        setNow(t)
      } else if (res.error === "in-game") setError({ text: "You're already in a game.", game: res.game_id })
      else if (res.error === "fair-play-ban") setError({ text: "Your account is closed for rated games after a fair-play review." })
      else setError({ text: "Couldn't start the search. Please try again." })
    })
  }
  const cancel = () => {
    socket.current?.emit("seek:leave", null, () => {})
    setSeeking(null)
  }

  const label = TIME_CONTROLS.find((t) => t.tc === tc)?.detail ?? tc
  const [m, inc] = tc.split("+").map(Number)
  const speed = speedOf(m * 60000, inc * 1000)
  const mine = ratings.find((r) => r.speed === speed)
  const waited = seeking ? Math.max(0, Math.floor((now - seeking.since) / 1000)) : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col g-panel p-5 lg:overflow-y-auto">
      <PanelHeader title="Play online" />
      <p className="mt-2 text-[14px] g-muted">
        Rated games against a player of similar strength.
        {lobby ? ` ${lobby.playing} ${lobby.playing === 1 ? "game" : "games"} being played now.` : ""}
      </p>
      {seeking ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
          <span aria-hidden="true" className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--g-panel-3)] border-t-[var(--g-gold)]" />
          <p className="mt-5 text-[22px] font-bold">Finding an opponent…</p>
          <p className="mt-1 text-[14px] g-muted">
            {SPEED_LABEL[speed]} {label} · {pass?.me.guest ? "casual" : `your rating ${seeking.rating}${seeking.provisional ? "?" : ""}`} ·{" "}
            {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, "0")}
          </p>
          <button type="button" className="g-btn mt-6 h-[44px] w-full" onClick={cancel}>
            Cancel
          </button>
          <p className="mt-3 text-[12px] g-muted">Keep this page open. The game starts as soon as someone is found.</p>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <TimeControlPicker value={tc} onChange={setTc} />
          </div>
          <button type="button" onClick={play} disabled={!token} className="g-btn g-btn-primary sticky bottom-[76px] z-10 mt-5 h-[52px] w-full text-[17px] lg:static">
            Play {label}
          </button>
          {pass?.me.guest ? (
            <p className="g-muted mt-3 text-[13px]">
              Playing as <b className="text-[var(--g-text)]">{pass.me.name}</b>. Guest games are casual (no rating).{" "}
              <Link href="/account?next=/play/online" className="text-[var(--g-gold)] underline underline-offset-2">
                Sign up
              </Link>{" "}
              to get a rating and keep your games.
            </p>
          ) : (
            token && (
              <p className="g-muted mt-3 text-[13px]">
                Your {SPEED_LABEL[speed].toLowerCase()} rating: {mine ? `${mine.rating}${mine.provisional ? "?" : ""}` : "1500? (new)"}
              </p>
            )
          )}
          {error && (
            <p className="mt-3 text-[14px] text-[#ff8a7d]">
              {error.text}{" "}
              {error.game && (
                <Link href={`/play/${error.game}`} className="font-semibold underline underline-offset-2">
                  Go to it
                </Link>
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}
