"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { PanelHeader } from "@/components/play-shell/nav"
import { GAME_URL } from "@/lib/game-types"
import { registerForTournament } from "@/lib/tournament-actions"

type Row = {
  rank: number
  player_id: string
  name: string
  score: number
  games: number
  sheet: number[]
  on_fire: boolean
  status: "playing" | "waiting" | "away"
}
type Arena = {
  id: string
  title: string
  handle: string
  time_control: string
  starts_at: number
  ends_at: number
  phase: "before" | "live" | "over" | "cancelled"
  server_now: number
  standings: Row[]
  playing_now: number
}
type You = { joined: boolean; waiting: boolean; game_id: string | null; paused: boolean } | null

const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  if (d >= 2) return `${d} days ${Math.floor((s % 86400) / 3600)} h`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`
}

export function ArenaView({ idOrHandle, token, meId, myName }: { idOrHandle: string; token: string | null; meId: string | null; myName: string | null }) {
  const router = useRouter()
  const socket = useRef<Socket | null>(null)
  const [arena, setArena] = useState<Arena | null>(null)
  const [you, setYou] = useState<You>(null)
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(0)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    const take = (a: Arena) => {
      setArena(a)
      // How far this device's clock is from the server's, for the countdown.
      setOffset(a.server_now - Date.now())
      setNow(Date.now())
    }
    s.on("connect", () =>
      s.emit("arena:watch", idOrHandle, (res: { ok: boolean; arena?: Arena; you?: You; registered?: boolean }) => {
        if (!res.ok || !res.arena) return setError("This arena isn't available.")
        take(res.arena)
        setYou(res.you ?? null)
        setRegistered(!!res.registered)
        if (res.you?.game_id) router.push(`/play/${res.you.game_id}`)
      })
    )
    s.on("arena:state", (a: Arena) => {
      take(a)
      if (meId) {
        const me = a.standings.find((r) => r.player_id === meId)
        setYou((y) => (y ? { ...y, waiting: me?.status === "waiting", joined: me?.status === "waiting" || me?.status === "playing" } : y))
      }
    })
    s.on("arena:paired", (p: { game_id: string }) => router.push(`/play/${p.game_id}`))
    return () => {
      s.disconnect()
    }
  }, [idOrHandle, token, meId, router])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const call = (event: string) =>
    socket.current?.emit(event, arena?.id, (res: { ok: boolean; you?: You; error?: string }) => {
      if (res.ok) {
        setYou(res.you ?? null)
        setError(null)
      } else {
        setError(
          res.error === "not-registered"
            ? "You're not registered for this tournament."
            : res.error === "not-started"
              ? "The arena hasn't started yet."
              : res.error === "over"
                ? "This arena has finished."
                : "That didn't work. Please try again."
        )
      }
    })

  // One tap to register (online arenas are free), then the arena is told to look again.
  const register = async () => {
    if (!arena) return
    setJoining(true)
    setError(null)
    const res = await registerForTournament(arena.handle, { player_name: myName ?? "Player", phone: null, fide_id: null, rating: null, city: null })
    setJoining(false)
    if (res.ok) {
      socket.current?.emit("arena:watch", arena.id, (r: { ok: boolean; registered?: boolean; you?: You }) => {
        if (r.ok) {
          setRegistered(!!r.registered)
          setYou(r.you ?? null)
        }
      })
    } else setError(res.error)
  }

  if (error && !arena) return <p className="py-16 text-center">{error}</p>
  if (!arena) return <p className="py-16 text-center g-muted">Opening the arena…</p>

  const serverNow = now + offset
  const header =
    arena.phase === "before"
      ? `Starts in ${span(arena.starts_at - serverNow)}`
      : arena.phase === "live"
        ? `${span(arena.ends_at - serverNow)} left · ${arena.playing_now} ${arena.playing_now === 1 ? "game" : "games"} on`
        : arena.phase === "cancelled"
          ? "Cancelled"
          : "Finished"

  return (
    <div className="mx-auto max-w-[1100px]">
      <PanelHeader title={arena.title} back="/play/tournaments" backLabel="Tournaments" />
    <div className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
      <div className="flex flex-col gap-4">
        <div className="g-panel bg-gradient-to-br from-[#2c4a39] to-[#1a2d23] p-6">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Arena · {arena.time_control}</p>
          <p className="mt-2 font-mono text-[26px] font-bold tabular-nums">{header}</p>
        </div>
        <div className="g-panel p-5">
          {!meId ? (
            <>
              <p className="text-[15px]">Sign in to play in this arena.</p>
              <Link href={`/account?next=${encodeURIComponent(`/play/arena/${idOrHandle}`)}`} className="g-btn g-btn-primary mt-4 w-full">
                Sign in
              </Link>
            </>
          ) : !registered ? (
            <>
              {arena.phase === "before" || arena.phase === "live" ? (
                <>
                  <p className="text-[15px]">Free entry. Register to play — it takes one tap.</p>
                  <button type="button" disabled={joining} className="g-btn g-btn-primary mt-4 w-full" onClick={register}>
                    {joining ? "Registering…" : "Register for free"}
                  </button>
                </>
              ) : (
                <p className="text-[15px]">This arena is over. Final standings are shown here.</p>
              )}
            </>
          ) : arena.phase === "live" ? (
            you?.game_id ? (
              <Link href={`/play/${you.game_id}`} className="g-btn g-btn-primary w-full">
                Go to your game
              </Link>
            ) : you?.joined ? (
              <>
                <p className="text-[15px]">Waiting for an opponent… You&apos;ll be taken to the board automatically.</p>
                <button type="button" className="g-btn mt-4 w-full" onClick={() => call("arena:pause")}>
                  Pause
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px]">{you?.paused ? "You're paused. Join again when you're ready." : "Ready? Join to get paired."}</p>
                <button type="button" className="g-btn g-btn-primary mt-4 w-full" onClick={() => call("arena:join")}>
                  Join the arena
                </button>
              </>
            )
          ) : arena.phase === "before" ? (
            <p className="text-[15px]">You&apos;re registered. Keep this page open; the Join button appears when the arena starts.</p>
          ) : (
            <p className="text-[15px]">Thanks for playing. Final standings are on the right.</p>
          )}
          {error && <p className="mt-3 text-[13px] text-[#ff8a7d]">{error}</p>}
        </div>
        <div className="g-panel p-5 text-[14px] leading-[1.6]">
          <p className="font-medium">How the arena works</p>
          <p className="mt-1">
            You&apos;re paired again as soon as your game ends. A win scores 2, a draw 1. After two wins in a row you&apos;re on fire and
            score double until you stop winning.
          </p>
        </div>
      </div>

      <div className="g-panel min-w-0 p-5">
        <h2 className="g-title">Standings</h2>
        {arena.standings.length ? (
          <table className="mt-4 w-full text-[14px]">
            <thead>
              <tr className="border-b border-[var(--g-line)] text-left text-[12px] g-muted">
                <th className="w-[44px] py-2 font-normal">#</th>
                <th className="py-2 font-normal">Player</th>
                <th className="hidden py-2 font-normal sm:table-cell">Results</th>
                <th className="py-2 text-right font-normal">Score</th>
              </tr>
            </thead>
            <tbody>
              {arena.standings.map((r) => (
                <tr key={r.player_id} className={`border-b border-[var(--g-line)] ${r.player_id === meId ? "bg-[var(--g-panel-3)]" : ""}`}>
                  <td className="py-2.5 g-muted">{r.rank}</td>
                  <td className="py-2.5">
                    <span className="font-medium">{r.name}</span>
                    {r.on_fire && <span className="ml-2 rounded bg-[#c6542f] px-1.5 py-0.5 text-[11px] font-semibold text-white">🔥 on fire</span>}
                    {r.status === "playing" && <span className="ml-2 text-[12px] text-[var(--g-gold)]">playing</span>}
                  </td>
                  <td className="hidden py-2.5 font-mono text-[13px] tracking-wider g-muted sm:table-cell">{r.sheet.join(" ")}</td>
                  <td className="py-2.5 text-right text-[18px] font-bold">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-[15px] g-muted">Nobody has played yet.</p>
        )}
      </div>
    </div>
    </div>
  )
}
