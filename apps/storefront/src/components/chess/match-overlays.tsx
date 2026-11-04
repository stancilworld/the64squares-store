"use client"

import { Avatar, LevelBadge } from "@/components/play/avatar"
import { pieceSrc, useBoardSettings } from "@/lib/chess/settings"
import type { Level, Results } from "@/lib/profile-types"

// The two moments framed on the board: the "fight card" when a game starts, and the
// result when it ends. Both play once and get out of the way; a tap dismisses them.

export type Fighter = {
  name: string
  colour: "w" | "b"
  avatarUrl?: string | null
  rating?: number | null
  level?: Level | null
  record?: Results | null
  isBot?: boolean
}

function Side({ f, side }: { f: Fighter; side: "left" | "right" }) {
  return (
    <div className={`vs-side vs-${side} flex min-w-0 flex-1 flex-col items-center text-center`}>
      <div className="relative">
        {f.isBot ? (
          <span className="grid size-[64px] place-items-center rounded-full bg-[var(--g-panel-3)] text-[30px] sm:size-[84px] sm:text-[38px]" aria-hidden="true">
            ♞
          </span>
        ) : (
          <span className="block sm:hidden">
            <Avatar url={f.avatarUrl ?? null} name={f.name} size={64} />
          </span>
        )}
        {!f.isBot && (
          <span className="hidden sm:block">
            <Avatar url={f.avatarUrl ?? null} name={f.name} size={84} />
          </span>
        )}
        <span
          className={`absolute -bottom-1 -right-1 size-[20px] rounded-full border-2 border-[#15130f] ${f.colour === "w" ? "bg-[#f3ead8]" : "bg-[#2a2622]"}`}
          aria-label={f.colour === "w" ? "White" : "Black"}
        />
      </div>
      <p className="mt-2 w-full truncate px-1 text-[16px] font-extrabold leading-tight text-white sm:text-[20px]">{f.name}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[12px] text-white/75 sm:text-[13px]">
        {f.level && <LevelBadge level={f.level} compact />}
        {f.rating != null && <span className="font-mono">{f.rating}</span>}
      </div>
      {f.record && f.record.games > 0 && (
        <p className="mt-1 text-[12px] text-white/70 sm:text-[13px]">
          <b className="text-[var(--g-gold)]">{f.record.wins}</b> wins · {f.record.games} games
        </p>
      )}
    </div>
  )
}

export function MatchIntro({ a, b, label, onDone }: { a: Fighter; b: Fighter; label?: string; onDone: () => void }) {
  return (
    <div
      className="vs-intro absolute inset-0 z-[30] flex flex-col items-center justify-center overflow-hidden rounded-[inherit]"
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      onClick={onDone}
      role="presentation"
    >
      <div className="vs-flash absolute inset-0" />
      <div className="relative flex w-full items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Side f={a} side="left" />
        <span className="vs-mark shrink-0 text-[40px] font-black italic tracking-tight sm:text-[60px]">VS</span>
        <Side f={b} side="right" />
      </div>
      {label && <p className="vs-label relative mt-4 rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/85">{label}</p>}
    </div>
  )
}

// Confetti pieces with fixed (not random) positions so they render the same every time.
const CONFETTI = Array.from({ length: 42 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  dur: 1.6 + ((i * 29) % 70) / 100,
  colour: ["#e6c57f", "#f3ead8", "#5fd07a", "#c58be0", "#ff8a6b", "#7fb2d9"][i % 6],
  rot: (i * 47) % 360,
  wide: i % 3 === 0,
}))

export type Outcome = "win" | "loss" | "draw" | "neutral"

export function ResultBurst({ outcome, title, detail, king, onDone }: { outcome: Outcome; title: string; detail?: string; king?: "w" | "b"; onDone: () => void }) {
  const { pieces } = useBoardSettings()
  return (
    <div
      className={`rb rb-${outcome} absolute inset-0 z-[30] flex flex-col items-center justify-center overflow-hidden rounded-[inherit]`}
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      onClick={onDone}
      role="status"
    >
      {outcome === "win" && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="rb-confetti"
              style={{
                left: `${c.left}%`,
                width: c.wide ? 10 : 6,
                height: c.wide ? 6 : 12,
                background: c.colour,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.dur}s`,
                transform: `rotate(${c.rot}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="rb-card relative flex flex-col items-center px-6 text-center">
        {king && outcome !== "draw" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pieceSrc(pieces, `${king}K`)} alt="" className="rb-icon h-[72px] w-[72px] object-contain sm:h-[96px] sm:w-[96px]" />
        ) : (
          <span className="rb-icon text-[54px] font-black leading-none sm:text-[72px]" aria-hidden="true">
            ½
          </span>
        )}
        <p className="rb-title mt-2 text-[34px] font-black uppercase tracking-[0.06em] sm:text-[48px]">{title}</p>
        {detail && <p className="mt-1 text-[14px] font-medium text-white/85 sm:text-[16px]">{detail}</p>}
      </div>
    </div>
  )
}
