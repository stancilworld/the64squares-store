"use client"

import type { Fighter } from "@/components/chess/match-overlays"
import { Avatar } from "@/components/play/avatar"

// Before a tournament game: both players press Ready; the clocks start when both have.
// Whoever isn't ready in time loses that game. Spectators see who's ready.

function Seat({ f, ready }: { f: Fighter; ready: boolean }) {
  return (
    <div className={`ready-seat ${ready ? "is-ready" : ""}`}>
      <span className="relative">
        <Avatar url={f.avatarUrl ?? null} name={f.name} size={64} />
        <span className={`ready-tick ${ready ? "is-on" : ""}`} aria-hidden="true">
          {ready ? "✓" : "…"}
        </span>
      </span>
      <p className="ready-name">{f.name}</p>
      {f.rating != null && <p className="ready-rating">{f.rating}</p>}
      <p className="ready-state">{ready ? "Ready" : "Not ready yet"}</p>
    </div>
  )
}

export function ReadyCheck(p: {
  left: number
  white: Fighter
  black: Fighter
  player: boolean
  mine: boolean
  theirs: boolean
  readyW: boolean
  readyB: boolean
  opponent: string
  onReady: () => void
}) {
  return (
    <div className="ready-check" role="dialog" aria-label="Ready check">
      <p className="ready-title">{p.player ? (p.mine ? `Waiting for ${p.opponent}…` : "Your game is ready") : "Waiting for both players"}</p>
      <div className="ready-seats">
        <Seat f={p.white} ready={p.readyW} />
        <span className="ready-vs" aria-hidden="true">
          vs
        </span>
        <Seat f={p.black} ready={p.readyB} />
      </div>
      <p className="ready-clock" aria-live="polite">
        {Math.floor(p.left / 60)}:{String(p.left % 60).padStart(2, "0")}
      </p>
      {p.player && !p.mine && (
        <button type="button" className="ready-go" onClick={p.onReady}>
          I&apos;m ready
        </button>
      )}
      <p className="ready-note">
        {p.player
          ? p.mine
            ? p.theirs
              ? "Starting…"
              : "The clocks start when both of you are ready."
            : "Press Ready to start. If you're not ready in time, you lose this game."
          : "The game begins when both are ready."}
      </p>
    </div>
  )
}
