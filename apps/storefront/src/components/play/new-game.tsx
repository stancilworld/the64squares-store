"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { io } from "socket.io-client"
import { GAME_URL, TIME_CONTROLS } from "@/lib/game-types"

const COLOURS = [
  ["random", "Random"],
  ["w", "White"],
  ["b", "Black"],
] as const

// Pick a time control and colour; creates the challenge and opens its page.
export function NewGame({ token }: { token: string }) {
  const router = useRouter()
  const [tc, setTc] = useState("3+2")
  const [colour, setColour] = useState<(typeof COLOURS)[number][0]>("random")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = () => {
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
    <div className="rounded-md border border-rule p-6">
      <h2 className="font-display h-sub">Play a friend</h2>
      <p className="mt-1 text-[15px] text-muted">Create a game, then send the link. It starts when they accept.</p>
      <fieldset className="mt-6">
        <legend className="text-[14px] font-medium">Time control</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIME_CONTROLS.map((t) => (
            <button
              key={t.tc}
              type="button"
              aria-pressed={tc === t.tc}
              onClick={() => setTc(t.tc)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${tc === t.tc ? "border-black bg-black text-white" : "border-rule hover:border-black"}`}
            >
              <span className="block font-display text-[22px] leading-none">{t.tc}</span>
              <span className={`mt-1 block text-[12px] ${tc === t.tc ? "text-white/80" : "text-muted"}`}>
                {t.label}, {t.detail}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-[14px] font-medium">You play</legend>
        <div className="mt-2 flex gap-2">
          {COLOURS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={colour === value}
              onClick={() => setColour(value)}
              className={`h-[40px] flex-1 rounded-md border text-[14px] ${colour === value ? "border-black bg-black text-white" : "border-rule hover:border-black"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" disabled={busy} onClick={create} className="btn btn-solid mt-6 w-full disabled:opacity-60">
        {busy ? "Creating…" : "Create game link"}
      </button>
      {error && <p className="mt-3 text-[14px] text-love">{error}</p>}
    </div>
  )
}
