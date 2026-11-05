"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Board } from "@/components/chess/board"
import type { PlayPass } from "@/lib/play"
import { positionAt, type Puzzle, type PuzzleStats, puzzleApi, type Theme } from "@/lib/puzzles"
import { ScreenHeader } from "../menu/screen"
import { usePlayPass } from "../use-play-pass"

const THEME_ICON: Record<string, string> = {
  mateIn1: "#1",
  mateIn2: "#2",
  mateIn3: "#3",
  fork: "⑂",
  pin: "📌",
  skewer: "🗡",
  discoveredAttack: "💥",
  hangingPiece: "🎯",
  sacrifice: "🔥",
  backRankMate: "🏰",
  deflection: "↪",
  attraction: "🧲",
  promotion: "♛",
  endgame: "♔",
  opening: "♘",
  middlegame: "⚔",
  short: "⚡",
  long: "🧠",
  advantage: "＋",
  defensiveMove: "🛡",
  quietMove: "🤫",
  zugzwang: "⏳",
}

// Puzzles menu: puzzle of the day, the trainer, Puzzle Rush and practice by theme.
export function PuzzlesHome({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const [daily, setDaily] = useState<Puzzle | null>(null)
  const [stats, setStats] = useState<PuzzleStats | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])

  useEffect(() => {
    puzzleApi
      .daily(null)
      .then((d) => setDaily(d.puzzle))
      .catch(() => {})
    puzzleApi
      .themes()
      .then((t) => setThemes(t.themes))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!pass) return
    puzzleApi
      .me(token)
      .then(setStats)
      .catch(() => {})
  }, [pass, token])

  const dailyView = daily ? positionAt(daily, 1) : null
  const dailyColour = dailyView?.chess.turn() === "b" ? "black" : "white"

  return (
    <div className="menu-stage mx-auto flex max-w-[1180px] flex-col gap-5 pb-6">
      <ScreenHeader title="Puzzles" subtitle="Sharpen your tactics: find the winning move in positions from real games." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Puzzle of the day */}
        <Link href="/play/puzzles/daily" className="menu-hero menu-rise group flex items-center gap-5 p-5 sm:p-6">
          <div className="relative z-[1] w-[132px] shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40 sm:w-[190px]">
            {dailyView ? (
              <Board id="daily-preview" fen={dailyView.fen} orientation={dailyColour} movable={null} lastMove={dailyView.last} compact />
            ) : (
              <div className="aspect-square bg-[var(--g-panel-3)]" />
            )}
          </div>
          <div className="relative z-[1] min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--g-gold)]">Puzzle of the day</p>
            <p className="mt-2 text-[22px] font-extrabold leading-tight sm:text-[28px]">{dailyColour === "white" ? "White" : "Black"} to play</p>
            <p className="g-muted mt-1 text-[14px]">A new puzzle every day. +10 XP when you solve it.</p>
            <span className="g-btn g-btn-primary mt-4 !min-h-[42px]">{stats?.daily_done ? "Solved today ✓ · view" : "Solve it →"}</span>
          </div>
        </Link>

        {/* Stats */}
        <div className="menu-card menu-rise grid grid-cols-2 gap-2 p-4 [animation-delay:80ms] sm:p-5">
          <Big label="Puzzle rating" value={stats ? `${stats.rating}${stats.provisional ? "?" : ""}` : "—"} accent />
          <Big label="Current streak" value={stats ? `🔥 ${stats.streak}` : "—"} />
          <Big label="Solved" value={stats ? `${stats.solved}` : "—"} />
          <Big label="Rush best" value={stats ? `${stats.rush_best}` : "—"} />
          {stats && !stats.signed_in && (
            <p className="g-muted col-span-2 text-[12px]">
              <Link href="/account?next=/play/puzzles" className="text-[var(--g-gold)] underline underline-offset-2">
                Sign up
              </Link>{" "}
              to keep your puzzle rating everywhere and earn XP.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Link href="/play/puzzles/train" className="menu-tile menu-rise flex min-h-[150px] flex-col p-5 [animation-delay:140ms]" style={{ ["--tile-glow" as string]: "rgba(120,190,255,0.18)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/play-art/wN.webp" alt="" className="menu-tile-art !w-[38%]" />
          <span className="relative z-[1] text-[22px] font-extrabold">Puzzle Trainer</span>
          <span className="g-muted relative z-[1] mt-1 max-w-[60%] text-[14px]">Rated puzzles picked for your level. Your rating goes up as you solve.</span>
          <span className="relative z-[1] mt-auto inline-flex w-fit rounded-full bg-black/25 px-3 py-1 text-[13px] font-bold text-[var(--g-gold)]">Start →</span>
        </Link>
        <Link href="/play/puzzles/rush" className="menu-tile menu-rise flex min-h-[150px] flex-col p-5 [animation-delay:200ms]" style={{ ["--tile-glow" as string]: "rgba(255,120,90,0.2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/play-art/bQ.webp" alt="" className="menu-tile-art !w-[38%]" />
          <span className="relative z-[1] text-[22px] font-extrabold">Puzzle Rush</span>
          <span className="g-muted relative z-[1] mt-1 max-w-[60%] text-[14px]">3 minutes, 3 lives. How many can you solve?</span>
          <span className="relative z-[1] mt-auto inline-flex w-fit rounded-full bg-black/25 px-3 py-1 text-[13px] font-bold text-[var(--g-gold)]">
            {stats?.rush_best ? `Best ${stats.rush_best} · Play →` : "Play →"}
          </span>
        </Link>
      </div>

      {themes.length > 0 && (
        <section className="menu-rise [animation-delay:260ms]">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--g-gold)]">Practise a theme</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {themes.map((t) => (
              <Link key={t.theme} href={`/play/puzzles/train?theme=${t.theme}`} className="menu-pick flex items-center gap-3 px-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/25 text-[16px] font-black text-[var(--g-gold)]">{THEME_ICON[t.theme] ?? "♟"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold">{t.name}</span>
                  <span className="g-muted block text-[12px]">{t.count.toLocaleString("en-IN")} puzzles</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col justify-center rounded-xl bg-black/20 px-3 py-3">
      <p className="g-muted text-[11px] font-bold uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-mono text-[26px] font-bold leading-none ${accent ? "text-[var(--g-gold)]" : ""}`}>{value}</p>
    </div>
  )
}
