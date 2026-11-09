"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { io } from "socket.io-client"
import { GAME_URL, TIME_CONTROLS } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import { ColourPick, ScreenHeader } from "./menu/screen"
import { TimeCards } from "./menu/time-cards"
import { usePlayPass } from "./use-play-pass"

// Play a friend: pick a time control and colour, then share the game's link.
export function NewGame({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const router = useRouter()
  const [tc, setTc] = useState("10+0")
  const [colour, setColour] = useState<"w" | "random" | "b">("random")
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

  const label = TIME_CONTROLS.find((t) => t.tc === tc)?.detail ?? tc
  return (
    <div className="menu-stage mx-auto flex max-w-[980px] flex-col gap-6 pb-24 lg:pb-4">
      <ScreenHeader title="Play a Friend" subtitle="Create a game and send the link. It starts when your friend opens it. Friendly games don't change ratings." />
      <TimeCards value={tc} onChange={setTc} />
      <section className="menu-rise [animation-delay:280ms]">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--g-muted)]">I play</h2>
        <div className="max-w-[420px]">
          <ColourPick value={colour} onChange={setColour} />
        </div>
      </section>
      <div className="fixed inset-x-0 bottom-[62px] z-20 bg-gradient-to-t from-[var(--g-bg)] via-[var(--g-bg)]/95 to-transparent px-3 pb-3 pt-6 lg:static lg:bg-none lg:p-0">
        <div className="mx-auto flex max-w-[980px] flex-col items-center gap-3 sm:flex-row">
          <button type="button" disabled={busy || !token} onClick={create} className="menu-play flex h-[60px] w-full items-center justify-center sm:w-[320px]">
            <span className="relative text-[19px] font-extrabold tracking-tight">{busy ? "Creating…" : `Create ${label} game`}</span>
          </button>
          {pass?.me.guest && (
            <p className="g-muted text-center text-[13px] sm:text-left">
              Playing as {pass.me.name}.{" "}
              <Link href="/account?next=/play/friend" className="text-[var(--g-accent)] underline underline-offset-2">
                Sign in
              </Link>{" "}
              to use your own name.
            </p>
          )}
        </div>
        {error && <p className="mt-3 text-center text-[14px] text-[var(--g-bad)] sm:text-left">{error}</p>}
      </div>
    </div>
  )
}
