/* eslint-disable @next/next/no-img-element */
import { type Level, TITLE_COLOURS } from "@/lib/profile-types"

// A player's picture, or their first letter on a coloured tile.
export function Avatar({ url, name, size = 36, online, className = "" }: { url?: string | null; name: string; size?: number; online?: boolean; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" width={size} height={size} className="h-full w-full rounded-lg object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center rounded-lg bg-[var(--g-panel-3)] font-bold text-[var(--g-text)]"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      {online != null && (
        <span
          title={online ? "Online" : "Offline"}
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--g-panel)] ${online ? "bg-[#5fd07a]" : "bg-[#6b7a71]"}`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      )}
    </span>
  )
}

// "Lv 7 · Knight" in the title's colour.
export function LevelBadge({ level, compact = false }: { level: Level; compact?: boolean }) {
  const colour = TITLE_COLOURS[level.title] ?? "#9db0a4"
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-[1px] text-[11px] font-bold leading-[16px]"
      style={{ color: colour, background: `${colour}22`, border: `1px solid ${colour}55` }}
      title={`Level ${level.level} · ${level.title} · ${level.xp} XP`}
    >
      Lv {level.level}
      {!compact && <span className="font-semibold">· {level.title}</span>}
    </span>
  )
}

export function XpBar({ level }: { level: Level }) {
  const pct = Math.min(100, Math.round((level.into / Math.max(1, level.needed)) * 100))
  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--g-panel-3)]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#c99a4c] to-[#e6c57f]" style={{ width: `${pct}%` }} />
      </div>
      <p className="g-muted mt-1 text-[12px]">
        {level.into} / {level.needed} XP to level {level.level + 1}
      </p>
    </div>
  )
}
