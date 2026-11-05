"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { GIcon } from "@/components/play-shell/icons"
import type { PlayPass } from "@/lib/play"
import { type Puzzle, type PuzzleResult, type PuzzleStats, puzzleApi } from "@/lib/puzzles"
import { usePlayPass } from "../use-play-pass"
import { PuzzleSolver, type SolverState } from "./solver"

export const THEME_LABEL: Record<string, string> = {
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered attack",
  hangingPiece: "Hanging piece",
  sacrifice: "Sacrifice",
  backRankMate: "Back-rank mate",
  deflection: "Deflection",
  attraction: "Attraction",
  promotion: "Promotion",
  endgame: "Endgame",
  opening: "Opening",
  middlegame: "Middlegame",
  short: "Short",
  long: "Long",
  advantage: "Win material",
  defensiveMove: "Defensive move",
  quietMove: "Quiet move",
  zugzwang: "Zugzwang",
  mate: "Checkmate",
  crushing: "Crushing",
}

type Mode = { kind: "train"; theme?: string | null } | { kind: "daily" } | { kind: "one"; id: string }

const Token = ({ colour }: { colour: "w" | "b" }) => (
  <span className={`inline-block h-[14px] w-[14px] rounded-full border ${colour === "w" ? "border-black/20 bg-[#f3ead8]" : "border-white/30 bg-[#2a2622]"}`} />
)

// Puzzle trainer, puzzle of the day, or one puzzle by its id.
export function PuzzleTrainer({ mode, initialPass }: { mode: Mode; initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [stats, setStats] = useState<PuzzleStats | null>(null)
  const [result, setResult] = useState<PuzzleResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const theme = mode.kind === "train" ? (mode.theme ?? null) : null
  const id = mode.kind === "one" ? mode.id : null

  useEffect(() => {
    if (!pass) return
    let live = true
    const load = mode.kind === "daily" ? puzzleApi.daily(token) : id ? puzzleApi.one(token, id) : puzzleApi.next(token, theme)
    load
      .then((r) => {
        if (!live) return
        setPuzzle(r.puzzle)
        setResult(null)
      })
      .catch(() => live && setError("No puzzles to show right now. Please try again in a moment."))
    puzzleApi.me(token).then((s) => live && setStats(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [pass, token, mode.kind, theme, id, round])

  const next = useCallback(() => setRound((r) => r + 1), [])

  if (error) {
    return (
      <div className="g-panel mx-auto mt-10 max-w-[480px] p-6 text-center">
        <p className="text-[16px]">{error}</p>
        <Link href="/play/puzzles" className="g-btn g-btn-primary mt-5">
          Back to puzzles
        </Link>
      </div>
    )
  }
  if (!puzzle) return <p className="g-muted py-16 text-center">Setting up the puzzle…</p>

  const title = mode.kind === "daily" ? "Puzzle of the day" : theme ? (THEME_LABEL[theme] ?? "Puzzles") : mode.kind === "one" ? "Puzzle" : "Puzzle Trainer"
  const shownRating = result ? result.rating : stats?.rating
  const canNext = mode.kind === "train"

  const panel = (s: SolverState) => {
    const side = s.colour === "w" ? "White" : "Black"
    const done = s.status === "solved" || s.status === "failed"
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/play/puzzles" aria-label="Back to puzzles" className="g-btn g-btn-ghost !min-h-[36px] !w-[36px] !px-0">
            <GIcon name="back" size={18} />
          </Link>
          <h1 className="g-title flex-1 truncate">{title}</h1>
        </div>

        {/* What's happening */}
        {s.status === "solved" ? (
          <div className="menu-rise rounded-2xl bg-gradient-to-b from-[#2f6b44] to-[#24543a] p-5 shadow-[0_4px_0_#163524]">
            <p className="text-[24px] font-extrabold">{s.missed ? "Solved" : "Correct! ✓"}</p>
            <p className="mt-1 text-[14px] text-white/85">
              {s.missed ? "Solved with help: it counts as a miss." : "Well found."} Puzzle rating {puzzle.rating}.
            </p>
            <ResultLine result={result} />
          </div>
        ) : s.status === "failed" ? (
          <div className="menu-rise rounded-2xl bg-[var(--g-panel-2)] p-5">
            <p className="text-[22px] font-extrabold">That&apos;s the solution</p>
            <p className="g-muted mt-1 text-[14px]">Puzzle rating {puzzle.rating}. Try the next one.</p>
            <ResultLine result={result} />
          </div>
        ) : s.status === "wrong" ? (
          <div className="menu-rise rounded-2xl bg-gradient-to-b from-[#6b2f2a] to-[#542420] p-5 shadow-[0_4px_0_#351512]">
            <p className="text-[22px] font-extrabold">Not the move</p>
            <p className="mt-1 text-[14px] text-white/85">There&apos;s something better. Try again, or see the answer.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="g-btn" onClick={s.retry}>
                Try again
              </button>
              <button type="button" className="g-btn g-btn-ghost" onClick={s.showSolution}>
                Solution
              </button>
            </div>
          </div>
        ) : (
          <div className="g-panel p-5">
            <p className="flex items-center gap-2 text-[22px] font-extrabold">
              <Token colour={s.colour} />
              {s.yourTurn ? "Your turn" : "Watch the move…"}
            </p>
            <p className="g-muted mt-1 text-[14px]">Find the best move for {side}.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="g-btn" onClick={s.hint} disabled={!s.yourTurn}>
                💡 Hint
              </button>
              <button type="button" className="g-btn g-btn-ghost" onClick={s.showSolution} disabled={!s.yourTurn}>
                Solution
              </button>
            </div>
            <p className="g-muted mt-2 text-[12px]">A hint or the solution counts as a miss.</p>
          </div>
        )}

        {done && (
          <div className="flex flex-col gap-2">
            {canNext ? (
              <button type="button" className="menu-play flex h-[56px] w-full items-center justify-center" onClick={next} autoFocus>
                <span className="relative text-[18px] font-black uppercase tracking-wide">Next puzzle →</span>
              </button>
            ) : (
              <Link href="/play/puzzles/train" className="menu-play flex h-[56px] w-full items-center justify-center">
                <span className="relative text-[18px] font-black uppercase tracking-wide">More puzzles →</span>
              </Link>
            )}
            {puzzle.themes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {puzzle.themes
                  .filter((t) => THEME_LABEL[t])
                  .map((t) => (
                    <Link key={t} href={`/play/puzzles/train?theme=${t}`} className="rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-semibold hover:text-[var(--g-gold)]">
                      {THEME_LABEL[t]}
                    </Link>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto grid grid-cols-3 gap-2">
          <Stat label="Puzzle rating" value={shownRating != null ? `${shownRating}${(result ?? stats)?.provisional ? "?" : ""}` : "—"} />
          <Stat label="Streak" value={`${(result ?? stats)?.streak ?? 0}`} icon="🔥" />
          <Stat label="Solved" value={`${(result ?? stats)?.solved ?? 0}`} />
        </div>
        {pass?.me.guest && (
          <p className="g-muted text-[12px]">
            <Link href="/account?next=/play/puzzles" className="text-[var(--g-gold)] underline underline-offset-2">
              Sign up
            </Link>{" "}
            to keep your puzzle rating and earn XP.
          </p>
        )}
      </div>
    )
  }

  return (
    <PuzzleSolver
      key={`${puzzle.id}-${round}`}
      puzzle={puzzle}
      onFirstResult={(solved) => {
        puzzleApi
          .result(token, puzzle.id, solved)
          .then(setResult)
          .catch(() => {})
      }}
      panel={panel}
      top={<BarLine left={title} right={result || stats ? null : null} />}
      bottom={(s) => <BarLine left={s.colour === "w" ? "You play White" : "You play Black"} right={null} />}
    />
  )
}

function ResultLine({ result }: { result: PuzzleResult | null }) {
  if (!result) return null
  if (!result.rated) return <p className="mt-3 text-[13px] text-white/75">Already tried before, so your rating doesn&apos;t change.</p>
  const d = result.diff ?? 0
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-3 py-1 font-mono text-[15px] font-bold ${d >= 0 ? "bg-[#5fd07a]/20 text-[#7be39a]" : "bg-[#ff8a7d]/15 text-[#ff8a7d]"}`}>
        {d >= 0 ? `+${d}` : d}
      </span>
      <span className="text-[14px]">Rating {result.rating}</span>
      {result.xp ? <span className="rounded-full bg-[var(--g-gold)]/20 px-2.5 py-1 text-[12px] font-bold text-[var(--g-gold)]">+{result.xp} XP</span> : null}
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-2 py-2.5 text-center">
      <p className="g-muted text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 font-mono text-[18px] font-bold">
        {icon && <span className="mr-0.5 text-[14px]">{icon}</span>}
        {value}
      </p>
    </div>
  )
}

function BarLine({ left, right }: { left: string; right: React.ReactNode }) {
  return (
    <div className="flex h-[40px] items-center justify-between text-[14px] font-semibold">
      <span className="g-muted">{left}</span>
      {right}
    </div>
  )
}
