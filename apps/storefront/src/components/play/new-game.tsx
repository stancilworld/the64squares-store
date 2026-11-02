"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { io } from "socket.io-client"
import { GAME_URL } from "@/lib/game-types"
import { TimeControlPicker } from "./time-control-picker"

const COLOURS = [
  ["w", "White"],
  ["random", "Random"],
  ["b", "Black"],
] as const

// Play a friend: pick a time control and colour, then share the game's link.
export function NewGame({ token }: { token: string | null }) {
  const router = useRouter()
  const [tc, setTc] = useState("10+0")
  const [colour, setColour] = useState<(typeof COLOURS)[number][0]>("random")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    if (!token) return
    setBusy(true)
    setError(null)
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    const fail = () => {
      setBusy(false)
      setError("Couldn't reach the game server. Please try again.")
      s.disconnect()
    }
    const timer = setTimeout(fail, 8000)
    s.emit("game:create", { tc, colour }, (res: { ok: boolean; id?: string }) => {
      clearTimeout(timer)
      s.disconnect()
      if (res.ok && res.id) router.push(`/play/${res.id}`)
      else fail()
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-rule bg-white p-5">
      <h1 className="font-display h-sub">Play a friend</h1>
      <p className="mt-1 text-[14px] text-muted">Create a game and send the link. It starts when your friend accepts.</p>
      <div className="mt-4">
        <TimeControlPicker value={tc} onChange={setTc} />
      </div>
      <p className="mt-4 text-[13px] font-medium">I play</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {COLOURS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={colour === value}
            onClick={() => setColour(value)}
            className={`h-[40px] rounded-md border text-[14px] ${colour === value ? "border-velvet bg-maple-soft font-semibold" : "border-rule"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {token ? (
        <button type="button" disabled={busy} onClick={create} className="btn btn-solid mt-5 h-[48px] w-full text-[16px] disabled:opacity-60">
          {busy ? "Creating…" : "Create game link"}
        </button>
      ) : (
        <Link href="/account?next=/play/friend" className="btn btn-solid mt-5 h-[48px] w-full">
          Sign in to play
        </Link>
      )}
      {error && <p className="mt-3 text-[14px] text-love">{error}</p>}
      <p className="mt-3 text-[12px] text-muted">Games with friends are casual: they don&apos;t change your rating.</p>
    </div>
  )
}
