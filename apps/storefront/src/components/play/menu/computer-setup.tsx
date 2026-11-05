"use client"

import Link from "next/link"
import { LEVELS } from "@/lib/chess/engine"
import { ColourPick, ScreenHeader } from "./screen"

// Each bot gets a piece: stronger bots, bigger pieces.
const BOT_ART = ["wP", "wN", "wB", "wR", "bN", "bR", "bQ", "bK"]
const BOT_LINE = [
  "Still learning how the pieces move.",
  "Knows the rules, misses a lot.",
  "Plays for fun, leaves pieces hanging.",
  "A solid club player. Watch your forks.",
  "Rarely blunders. Punishes loose pieces.",
  "Tournament strength. Bring a plan.",
  "Sharp and accurate. Very hard to beat.",
  "Full engine strength. Good luck.",
]

type Setup = { level: number; colour: "w" | "b" | "random" }

// Vs Computer: choose the bot and your colour before the board appears.
export function ComputerSetup({ setup, onChange, onStart, signedIn }: { setup: Setup; onChange: (f: (s: Setup) => Setup) => void; onStart: () => void; signedIn: boolean }) {
  const chosen = LEVELS.find((l) => l.level === setup.level) ?? LEVELS[2]
  return (
    <div className="menu-stage mx-auto flex max-w-[1080px] flex-col gap-6 pb-24 lg:pb-4">
      <ScreenHeader title="Vs Computer" subtitle="Pick your opponent. Take moves back and ask for hints any time." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Opponent" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {LEVELS.map((l, i) => (
            <button
              key={l.level}
              type="button"
              aria-pressed={setup.level === l.level}
              onClick={() => onChange((s) => ({ ...s, level: l.level }))}
              className="menu-pick menu-rise flex flex-col items-center px-2 pb-3 pt-2 text-center"
              style={{ animationDelay: `${40 + i * 35}ms` }}
            >
              <span className="relative grid h-[66px] w-full place-items-center sm:h-[84px]">
                <span className="absolute bottom-1 h-[12px] w-[60%] rounded-[50%] bg-black/35 blur-[3px]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/pieces/wood3d/${BOT_ART[i]}.webp`} alt="" className="relative h-[62px] w-[62px] object-contain sm:h-[80px] sm:w-[80px]" />
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-[var(--g-gold)]">Level {l.level}</span>
              <span className="text-[15px] font-extrabold leading-tight">{l.name}</span>
              <span className="g-muted text-[12px]">Rating {l.elo}</span>
              <span className="mt-2 flex gap-[3px]" aria-hidden="true">
                {LEVELS.map((x) => (
                  <span key={x.level} className={`h-[5px] w-[9px] rounded-full ${x.level <= l.level ? "bg-[var(--g-gold)]" : "bg-white/10"}`} />
                ))}
              </span>
            </button>
          ))}
        </section>

        <aside className="menu-card menu-rise flex flex-col p-5 [animation-delay:200ms]">
          <div className="flex items-center gap-3">
            <span className="grid h-[64px] w-[64px] shrink-0 place-items-center rounded-2xl bg-black/25">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/pieces/wood3d/${BOT_ART[chosen.level - 1]}.webp`} alt="" className="h-[56px] w-[56px] object-contain" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--g-gold)]">Your opponent</p>
              <p className="text-[19px] font-extrabold leading-tight">{chosen.name}</p>
              <p className="g-muted text-[13px]">Level {chosen.level} · rating {chosen.elo}</p>
            </div>
          </div>
          <p className="g-muted mt-3 text-[14px]">{BOT_LINE[chosen.level - 1]}</p>
          <h2 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--g-gold)]">I play</h2>
          <ColourPick value={setup.colour} onChange={(c) => onChange((s) => ({ ...s, colour: c }))} />
          <button type="button" onClick={onStart} className="menu-play mt-6 hidden h-[60px] w-full items-center justify-center lg:flex">
            <span className="relative text-[20px] font-black uppercase tracking-wide">Play</span>
          </button>
          {!signedIn && (
            <p className="g-muted mt-3 text-[13px]">
              <Link href="/account?next=/play/computer" className="text-[var(--g-gold)] underline underline-offset-2">
                Sign in
              </Link>{" "}
              to keep your games and earn XP.
            </p>
          )}
        </aside>
      </div>
      {/* On phones the Play button stays at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--g-bg)] via-[var(--g-bg)]/95 to-transparent px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-6 lg:hidden">
        <button type="button" onClick={onStart} className="menu-play flex h-[60px] w-full items-center justify-center">
          <span className="relative text-[19px] font-black uppercase tracking-wide">
            Play {chosen.name}
          </span>
        </button>
      </div>
    </div>
  )
}
