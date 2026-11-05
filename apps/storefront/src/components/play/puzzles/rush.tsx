"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { GIcon } from "@/components/play-shell/icons"
import { playSound } from "@/lib/chess/sounds"
import type { PlayPass } from "@/lib/play"
import { type Puzzle, puzzleApi } from "@/lib/puzzles"
import { usePlayPass } from "../use-play-pass"
import { PuzzleSolver } from "./solver"

const TIME = 180_000
const LIVES = 3

type Phase = "ready" | "playing" | "over"

// Puzzle Rush: as many puzzles as you can in 3 minutes. They get harder; three misses and you're out.
export function PuzzleRush({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const [phase, setPhase] = useState<Phase>("ready")
  const [set, setSet] = useState<Puzzle[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState<boolean[]>([])
  const [endsAt, setEndsAt] = useState(0)
  const [now, setNow] = useState(0)
  const [best, setBest] = useState<number | null>(null)
  const [newBest, setNewBest] = useState(false)
  const ended = useRef(false)

  useEffect(() => {
    if (!pass) return
    puzzleApi
      .me(token)
      .then((s) => setBest(s.rush_best))
      .catch(() => {})
  }, [pass, token])

  const finish = useCallback(
    (final: number) => {
      if (ended.current) return
      ended.current = true
      setPhase("over")
      playSound("end")
      puzzleApi
        .rushScore(token, final)
        .then((r) => {
          if (r.best != null) {
            setNewBest(final > 0 && final >= r.best)
            setBest(r.best)
          }
        })
        .catch(() => {})
    },
    [token]
  )

  useEffect(() => {
    if (phase !== "playing") return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= endsAt) finish(score)
    }, 200)
    return () => clearInterval(t)
  }, [phase, endsAt, score, finish])

  const start = async () => {
    const r = await puzzleApi.rush(token).catch(() => null)
    if (!r?.puzzles.length) return
    ended.current = false
    setSet(r.puzzles)
    setIndex(0)
    setScore(0)
    setMisses([])
    setNewBest(false)
    const t = Date.now()
    setNow(t)
    setEndsAt(t + TIME)
    setPhase("playing")
    playSound("start")
  }

  const onFinished = (solved: boolean) => {
    if (ended.current) return
    const nextScore = solved ? score + 1 : score
    const nextMisses = [...misses, !solved]
    setScore(nextScore)
    setMisses(nextMisses)
    if (nextMisses.filter(Boolean).length >= LIVES || index + 1 >= set.length) return finish(nextScore)
    setIndex(index + 1)
  }

  if (phase !== "playing") {
    return (
      <div className="menu-stage mx-auto flex min-h-[calc(100dvh-170px)] max-w-[560px] flex-col items-center justify-center py-8 text-center lg:min-h-[calc(100dvh-80px)]">
        <Link href="/play/puzzles" className="g-btn g-btn-ghost mb-6 !min-h-[38px] self-start !text-[13px]">
          <GIcon name="back" size={18} /> Puzzles
        </Link>
        <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--g-gold)]">Puzzle Rush</p>
        {phase === "over" ? (
          <>
            <p className="menu-rise mt-4 font-mono text-[96px] font-black leading-none text-[var(--g-gold)] drop-shadow-[0_0_30px_rgba(230,197,127,0.35)]">{score}</p>
            <p className="mt-2 text-[22px] font-extrabold">{newBest ? "New personal best! 🏆" : "puzzles solved"}</p>
            <p className="g-muted mt-1 text-[15px]">{best != null ? `Your best: ${best}` : ""}</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-[34px] font-extrabold leading-tight sm:text-[42px]">3 minutes. 3 lives.</h1>
            <p className="g-muted mt-3 max-w-[38ch] text-[16px]">Solve as many puzzles as you can. They start easy and get harder. Three wrong moves and the run ends.</p>
            {best ? <p className="mt-4 text-[15px]">Your best: <b className="text-[var(--g-gold)]">{best}</b></p> : null}
          </>
        )}
        <button type="button" onClick={start} disabled={!pass} className="menu-play mt-8 flex h-[62px] w-full max-w-[320px] items-center justify-center">
          <span className="relative text-[21px] font-black uppercase tracking-wide">{phase === "over" ? "Play again" : "Start"}</span>
        </button>
        {phase === "over" && (
          <Link href="/play/puzzles" className="g-muted mt-4 text-[14px] underline underline-offset-4">
            Back to puzzles
          </Link>
        )}
      </div>
    )
  }

  const left = Math.max(0, endsAt - now)
  const low = left < 30_000
  const puzzle = set[index]
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`
  const hud = (
    <div className="flex h-[44px] items-center justify-between">
      <span className="flex items-center gap-1.5 text-[15px] font-bold">
        {Array.from({ length: LIVES }, (_, i) => (
          <span key={i} className={`text-[20px] ${i < LIVES - misses.filter(Boolean).length ? "" : "opacity-30 grayscale"}`} aria-hidden="true">
            ❤️
          </span>
        ))}
        <span className="sr-only">{misses.filter(Boolean).length} misses</span>
      </span>
      <span className={`rounded-lg px-3 py-1 font-mono text-[22px] font-bold ${low ? "bg-[#b23b31] text-white" : "bg-black/30"}`}>{clock}</span>
    </div>
  )
  return (
    <PuzzleSolver
      key={`${puzzle.id}-${index}`}
      puzzle={puzzle}
      strict
      onFinished={onFinished}
      top={hud}
      bottom={(s) => (
        <div className="flex h-[40px] items-center justify-between text-[14px] font-semibold">
          <span className="g-muted">{s.colour === "w" ? "White to play" : "Black to play"}</span>
          <span>
            Score <b className="font-mono text-[20px] text-[var(--g-gold)]">{score}</b>
          </span>
        </div>
      )}
      panel={(s) => (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="g-panel p-5 text-center">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--g-gold)]">Puzzle Rush</p>
            <p className="mt-2 font-mono text-[64px] font-black leading-none">{score}</p>
            <p className="g-muted mt-1 text-[13px]">Puzzle {index + 1} · rating {puzzle.rating}</p>
            <p className="mt-3 text-[15px] font-semibold">{s.yourTurn ? `Find the best move for ${s.colour === "w" ? "White" : "Black"}` : "…"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Results so far">
            {misses.map((m, i) => (
              <span key={i} className={`grid h-7 w-7 place-items-center rounded-md text-[12px] font-bold ${m ? "bg-[#b23b31]/80" : "bg-[#2f7a4a]"}`}>
                {m ? "✕" : "✓"}
              </span>
            ))}
          </div>
          <button type="button" className="g-btn g-btn-ghost mt-auto" onClick={() => finish(score)}>
            End run
          </button>
        </div>
      )}
    />
  )
}
