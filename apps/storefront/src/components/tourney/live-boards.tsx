"use client"

import Link from "next/link"
import type { LiveBoard } from "@/lib/tournament-types"
import { useNow } from "./countdown"
import { MiniBoard } from "./mini-board"

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function Player({ p, ms, running, top }: { p: LiveBoard["white"]; ms: number; running: boolean; top?: boolean }) {
  return (
    <span className={`flex items-center justify-between gap-2 px-1 ${top ? "pb-1.5" : "pt-1.5"}`}>
      <span className="min-w-0 truncate text-[13px] font-semibold">
        {p?.name ?? "?"}
        {p?.rating != null && <span className="ml-1.5 text-[11px] font-normal tabular-nums text-[var(--g-muted)]">{p.rating}</span>}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[13px] font-bold tabular-nums ${running ? "bg-white text-black" : "bg-black/40 text-white/80"}`}>{clock(ms)}</span>
    </span>
  )
}

function Board({ b, offset, big }: { b: LiveBoard; offset: number; big?: boolean }) {
  const now = useNow()
  const elapsed = now === null || !b.clock_running ? 0 : Math.max(0, now + offset - b.server_now)
  const w = b.clocks.w - (b.clock_running === "w" ? elapsed : 0)
  const bl = b.clocks.b - (b.clock_running === "b" ? elapsed : 0)
  return (
    <Link href={`/play/${b.game_id}`} className={`group block rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-2.5 transition hover:border-[#ff3b3b]/70 ${big ? "" : ""}`} aria-label={`Watch ${b.white?.name} against ${b.black?.name}`}>
      <Player p={b.black} ms={bl} running={b.clock_running === "b"} top />
      <MiniBoard fen={b.fen} lastMove={b.last_move} label={`${b.white?.name} against ${b.black?.name}`} />
      <Player p={b.white} ms={w} running={b.clock_running === "w"} />
      {big && <span className="mt-2 block text-center text-[13px] font-semibold text-[#ff6b6b] group-hover:underline">Open the board to watch with chat and moves</span>}
    </Link>
  )
}

// Every game being played in the tournament, updating move by move: the top board large,
// the rest in a grid (like a broadcast).
export function LiveBoards({ boards, offset }: { boards: LiveBoard[]; offset: number }) {
  if (!boards.length) return <p className="g-muted py-8 text-center">No games are being played right now.</p>
  const [top, ...rest] = boards
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[13px] font-bold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff3b3b] motion-reduce:animate-none" /> Top board
        </p>
        <Board b={top} offset={offset} big />
      </div>
      {rest.length > 0 && (
        <div className="grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
          {rest.map((b) => (
            <Board key={b.game_id} b={b} offset={offset} />
          ))}
        </div>
      )}
    </div>
  )
}
