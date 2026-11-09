"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MiniBoard } from "@/components/chess/mini-board"
import { ArrowRight } from "@/components/icons"
import { GAME_URL } from "@/lib/game-types"
import { type Puzzle, positionAt, puzzleApi } from "@/lib/puzzles"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

const GAMES = [
  { tc: "1+0", time: "1 min", speed: "Bullet" },
  { tc: "3+2", time: "3 | 2", speed: "Blitz" },
  { tc: "5+0", time: "5 min", speed: "Blitz" },
  { tc: "10+0", time: "10 min", speed: "Rapid" },
  { tc: "15+10", time: "15 | 10", speed: "Rapid" },
]

export type HomeEvent = { href: string; title: string; weekday: string; day: string; month: string; line: string; status: string }

// The Play area on the homepage: today's puzzle, one-tap games and the next tournament.
export function HomePlay({ event }: { event: HomeEvent | null }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [online, setOnline] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    puzzleApi
      .daily(null)
      .then((d) => live && setPuzzle(d.puzzle))
      .catch(() => {})
    fetch(`${GAME_URL}/game/lobby`)
      .then((r) => r.json())
      .then((d) => live && setOnline((d.online ?? 0) + (d.playing ?? 0) * 2))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const pos = puzzle ? positionAt(puzzle, 1) : null
  const whiteToMove = pos ? pos.chess.turn() === "w" : true

  return (
    <section aria-labelledby="home-play" className="board-wash bg-ink text-white">
      <div className="mx-auto max-w-[1440px] px-6 py-14 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 id="home-play" className="font-display h-page">
              The board is set. Play free.
            </h2>
            <p className="mt-3 max-w-[520px] text-[16px] leading-[1.6] text-white/70">
              Live games against players of your level, eight computer opponents, daily puzzles and arena tournaments. No download.
            </p>
          </div>
          {online != null && online > 1 && (
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <span className="h-2 w-2 bg-[#58c57a]" />
              {online} players online now
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)_minmax(0,340px)]">
          {/* Puzzle of the day */}
          <Link href="/play/puzzles/daily" className="group flex flex-col bg-ink-soft p-5 ring-1 ring-white/10 transition hover:ring-amber">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[18px] font-extrabold tracking-tight">Puzzle of the day</h3>
              {puzzle && <span className="font-mono text-[13px] text-white/60">Rating {puzzle.rating}</span>}
            </div>
            <MiniBoard fen={pos?.fen ?? START} flip={!whiteToMove} marks={pos?.last ? [pos.last.from, pos.last.to] : []} className="mt-4 w-full" />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[15px] font-semibold">
                <span className={`h-3.5 w-3.5 border border-white/40 ${whiteToMove ? "bg-white" : "bg-black"}`} />
                {whiteToMove ? "White" : "Black"} to move
              </span>
              <span className="flex items-center gap-2 text-[15px] font-bold text-amber">
                Solve it
                <ArrowRight className="h-[9px] w-[26px] transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          {/* One-tap games */}
          <div className="flex flex-col bg-ink-soft p-5 ring-1 ring-white/10">
            <h3 className="text-[18px] font-extrabold tracking-tight">Start a game</h3>
            <p className="mt-1 text-[14px] text-white/60">Pick a time control and we pair you with a player near your rating.</p>
            <div className="mt-4 grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              {GAMES.map((g) => (
                <Link
                  key={g.tc}
                  href={`/play/online?tc=${encodeURIComponent(g.tc)}&go=1`}
                  className="group/tc flex min-h-[96px] flex-col items-center justify-center bg-white/[0.06] transition-colors hover:bg-amber hover:text-black"
                >
                  <span className="font-mono text-[26px] font-extrabold leading-none tracking-tight">{g.time}</span>
                  <span className="mt-1.5 text-[13px] font-medium text-white/60 group-hover/tc:text-black/70">{g.speed}</span>
                </Link>
              ))}
              <Link href="/play/computer" className="group/tc flex min-h-[96px] flex-col items-center justify-center bg-white/[0.06] transition-colors hover:bg-amber hover:text-black">
                <span className="text-[19px] font-extrabold leading-none tracking-tight">Computer</span>
                <span className="mt-1.5 text-[13px] font-medium text-white/60 group-hover/tc:text-black/70">8 levels</span>
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-semibold">
              <Link href="/play/friend" className="underline decoration-white/30 underline-offset-4 hover:decoration-amber">
                Invite a friend
              </Link>
              <Link href="/play/puzzles" className="underline decoration-white/30 underline-offset-4 hover:decoration-amber">
                Puzzle Rush
              </Link>
              <Link href="/play/leaderboard" className="underline decoration-white/30 underline-offset-4 hover:decoration-amber">
                Leaderboard
              </Link>
            </div>
          </div>

          {/* Next tournament */}
          <div className="flex flex-col bg-ink-soft p-5 ring-1 ring-white/10">
            <h3 className="text-[18px] font-extrabold tracking-tight">Next tournament</h3>
            {event ? (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center bg-amber text-black">
                    <span className="text-[12px] font-semibold">{event.weekday}</span>
                    <span className="font-display text-[32px] leading-none">{event.day}</span>
                    <span className="text-[12px] font-semibold">{event.month}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[19px] font-extrabold leading-tight tracking-tight">{event.title}</p>
                    <p className="mt-1.5 text-[14px] text-white/65">{event.line}</p>
                  </div>
                </div>
                <p className="mt-4 text-[14px] font-semibold text-[#58c57a]">{event.status}</p>
                <div className="mt-auto flex flex-col gap-2 pt-5">
                  <Link href={event.href} className="btn btn-light w-full">
                    Register
                  </Link>
                  <Link href="/tournaments" className="py-2 text-center text-[14px] font-semibold text-white/70 hover:text-white">
                    All tournaments
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-[15px] leading-[1.6] text-white/65">New arenas and over-the-board opens are announced here first.</p>
                <Link href="/tournaments" className="btn btn-light mt-auto w-full">
                  See tournaments
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
