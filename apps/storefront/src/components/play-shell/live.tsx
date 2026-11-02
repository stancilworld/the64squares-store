"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { io, type Socket } from "socket.io-client"
import { Avatar, LevelBadge } from "@/components/play/avatar"
import { GAME_URL, SPEED_LABEL, speedOf, tcText } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import type { PublicProfile } from "@/lib/profile-types"

// One live connection for the whole Play area (signed-in players): incoming challenges and
// friend requests pop up wherever the player is, and challenges can be sent from any screen.

type Incoming = { game_id: string; from: PublicProfile; initial_ms: number; increment_ms: number; expires_in: number; at: number }
type Outgoing = { game_id: string; to: PublicProfile; at: number }
type Toast = { id: number; text: string; href?: string }

const state: {
  socket: Socket | null
  incoming: Incoming[]
  outgoing: Outgoing | null
  toasts: Toast[]
  notice: { status: "warned" | "banned"; scope?: string } | null
  version: number
} = {
  socket: null,
  incoming: [],
  outgoing: null,
  toasts: [],
  notice: null,
  version: 0,
}
const listeners = new Set<() => void>()
const changed = () => {
  state.version++
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
let toastId = 0
const toast = (text: string, href?: string) => {
  const t = { id: ++toastId, text, href }
  state.toasts = [...state.toasts, t]
  changed()
  setTimeout(() => {
    state.toasts = state.toasts.filter((x) => x.id !== t.id)
    changed()
  }, 6000)
}

export const useLiveVersion = () => useSyncExternalStore(subscribe, () => state.version, () => 0)

// Ask the game server something over the live connection.
export const liveCall = <T = Record<string, unknown>,>(event: string, payload: unknown) =>
  new Promise<T>((ok) => {
    // The connection may still be starting when a screen first asks: wait a moment for it.
    let tries = 0
    const go = () => {
      const s = state.socket
      if (s) return s.emit(event, payload, (res: T) => ok(res))
      if (++tries > 40) return ok({ ok: false, error: "offline" } as T)
      setTimeout(go, 100)
    }
    go()
  })

export const sendChallenge = async (to: PublicProfile, tc: string, colour: "w" | "b" | "random") => {
  const res = await liveCall<{ ok: boolean; game_id?: string; error?: string }>("challenge:send", { to: to.player_id, tc, colour })
  if (res.ok && res.game_id) {
    state.outgoing = { game_id: res.game_id, to, at: Date.now() }
    changed()
  }
  return res
}

const ERRORS: Record<string, string> = {
  offline: "is offline right now",
  busy: "is in a game right now",
  "not-friends": "isn't on your friends list",
  "fair-play-ban": "can't be challenged: your account is closed after a fair-play review",
}
export const challengeError = (name: string, error?: string) => (error && ERRORS[error] ? `${name} ${ERRORS[error]}.` : "The challenge couldn't be sent.")

export function PlayLive({ pass }: { pass: PlayPass | null }) {
  const router = useRouter()
  useLiveVersion()
  const [now, setNow] = useState(0)
  const token = pass && !pass.me.guest ? pass.token : null

  useEffect(() => {
    if (!token) return
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    state.socket = s
    s.on("challenge:incoming", (c: Omit<Incoming, "at">) => {
      state.incoming = [...state.incoming.filter((x) => x.game_id !== c.game_id), { ...c, at: Date.now() }]
      changed()
    })
    s.on("challenge:closed", (c: { game_id: string; reason: string }) => {
      state.incoming = state.incoming.filter((x) => x.game_id !== c.game_id)
      if (state.outgoing?.game_id === c.game_id) {
        toast(c.reason === "declined" ? `${state.outgoing.to.display_name} declined your challenge.` : "Your challenge wasn't answered in time.")
        state.outgoing = null
      }
      changed()
    })
    s.on("challenge:accepted", (c: { game_id: string }) => {
      state.outgoing = null
      changed()
      router.push(`/play/${c.game_id}`)
    })
    s.on("fairplay:notice", (n: { status: "warned" | "banned"; scope?: string }) => {
      state.notice = n
      changed()
    })
    s.on("friends:changed", (c: { type: string; from?: PublicProfile; by?: string }) => {
      if (c.type === "request" && c.from) toast(`${c.from.display_name} sent you a friend request.`, "/play/friends?tab=requests")
      if (c.type === "accepted" && c.by) toast(`${c.by} accepted your friend request.`, "/play/friends")
      window.dispatchEvent(new Event("t64:friends-changed"))
    })
    return () => {
      s.disconnect()
      if (state.socket === s) state.socket = null
    }
  }, [token, router])

  const busy = state.incoming.length > 0 || !!state.outgoing
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [busy])

  const respond = async (c: Incoming, accept: boolean) => {
    state.incoming = state.incoming.filter((x) => x.game_id !== c.game_id)
    changed()
    const res = await liveCall<{ ok: boolean; game_id?: string }>("challenge:respond", { game_id: c.game_id, accept })
    if (accept && res.ok) router.push(`/play/${c.game_id}`)
    else if (accept) toast("That challenge is no longer open.")
  }

  const c = state.incoming[0]
  const o = state.outgoing
  const n = state.notice
  return (
    <>
      {n && (
        <div className="fixed inset-x-0 bottom-[74px] z-[64] flex justify-center px-3 lg:bottom-4" role="status">
          <div className="flex w-full max-w-[560px] items-start gap-3 rounded-2xl border border-[#c4483d]/60 bg-[#3a1d1a] p-4 text-[14px] shadow-2xl">
            <p className="flex-1">
              {n.status === "banned" ? (
                <>
                  <b>Your account is closed for {n.scope === "all" ? "games with other players" : "rated games and tournaments"}</b> after a fair-play
                  review: your games matched computer moves far more than is humanly normal.{" "}
                </>
              ) : (
                <>
                  <b>Fair-play warning.</b> Our checks found games that look like computer help. Using an engine or any outside help while playing
                  isn&apos;t allowed; next time the account will be closed for rated play.{" "}
                </>
              )}
              <a href="/contact" className="underline underline-offset-2">
                Contact us
              </a>{" "}
              if you think this is a mistake.
            </p>
            <button type="button" aria-label="Close" className="g-muted text-[16px]" onClick={() => ((state.notice = null), changed())}>
              ✕
            </button>
          </div>
        </div>
      )}
      {c && (
        <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-3" role="alertdialog" aria-label="Challenge">
          <div className="w-full max-w-[420px] rounded-2xl border border-[var(--g-gold)]/50 bg-[var(--g-panel)] p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <Avatar url={c.from.avatar_url} name={c.from.display_name} size={48} online />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold">{c.from.display_name} challenges you</p>
                <p className="g-muted flex items-center gap-2 text-[13px]">
                  {SPEED_LABEL[speedOf(c.initial_ms, c.increment_ms)]} {tcText(c.initial_ms, c.increment_ms)}
                  {c.from.level && <LevelBadge level={c.from.level} compact />}
                </p>
              </div>
              <span className="g-muted font-mono text-[13px]">{Math.max(0, Math.ceil((c.at + c.expires_in - (now || c.at)) / 1000))}s</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="g-btn" onClick={() => respond(c, false)}>
                Decline
              </button>
              <button type="button" className="g-btn g-btn-primary" onClick={() => respond(c, true)}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
      {o && (
        <div className="fixed inset-x-0 bottom-[74px] z-[65] flex justify-center px-3 lg:bottom-4">
          <div className="flex w-full max-w-[460px] items-center gap-3 rounded-2xl border border-[var(--g-line)] bg-[var(--g-panel-2)] p-3 shadow-2xl">
            <Avatar url={o.to.avatar_url} name={o.to.display_name} size={40} />
            <p className="min-w-0 flex-1 text-[14px]">
              Waiting for <b>{o.to.display_name}</b> to accept…{" "}
              <span className="g-muted">{Math.max(0, 60 - Math.floor(((now || o.at) - o.at) / 1000))}s</span>
            </p>
            <button
              type="button"
              className="g-btn !min-h-[36px] text-[13px]"
              onClick={async () => {
                await liveCall("challenge:respond", { game_id: o.game_id, accept: false })
                state.outgoing = null
                changed()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[75] flex flex-col items-center gap-2 px-3">
        {state.toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-[440px] items-center gap-3 rounded-xl bg-[var(--g-panel-3)] px-4 py-3 text-[14px] shadow-2xl">
            <span>{t.text}</span>
            {t.href && (
              <Link href={t.href} className="shrink-0 font-semibold text-[var(--g-gold)]">
                View
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
