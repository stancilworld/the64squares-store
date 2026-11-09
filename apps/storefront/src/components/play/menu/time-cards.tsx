"use client"

import { TIME_CONTROLS } from "@/lib/game-types"

const GROUPS = ["Bullet", "Blitz", "Rapid", "Classical"] as const

const ICONS: Record<(typeof GROUPS)[number], string> = {
  Bullet: "M5 19 19 5M14 5h5v5M5 14l5 5",
  Blitz: "M13 2 4 14h7l-1 8 9-12h-7z",
  Rapid: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  Classical: "M5 21h14M7 21l1-6h8l1 6M9 15V9h6v6M8 9h8M10 9V6h4v3M12 3v3",
}

// Time controls as big cards, grouped by speed. Shows your rating for each speed and how
// many players are waiting at each time control when that's known.
export function TimeCards({
  value,
  onChange,
  ratings,
  seeking,
}: {
  value: string
  onChange: (tc: string) => void
  ratings?: Partial<Record<string, string>>
  seeking?: Record<string, number>
}) {
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g, gi) => (
        <section key={g} className="menu-rise" style={{ animationDelay: `${60 + gi * 50}ms` }}>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--g-muted)]">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS[g]} />
            </svg>
            {g}
            {ratings?.[g.toLowerCase()] && <span className="ml-auto font-mono text-[12px] normal-case tracking-normal text-[var(--g-muted)]">Your rating {ratings[g.toLowerCase()]}</span>}
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            {TIME_CONTROLS.filter((t) => t.label === g).map((t) => {
              const [min, inc] = t.tc.split("+")
              const waiting = seeking?.[t.tc] ?? 0
              return (
                <button
                  key={t.tc}
                  type="button"
                  aria-pressed={value === t.tc}
                  onClick={() => onChange(t.tc)}
                  className="menu-pick flex h-[78px] flex-col items-center justify-center sm:h-[86px]"
                >
                  <span className="text-[24px] font-extrabold leading-none">
                    {min}
                    {inc !== "0" && <span className="text-[16px] font-bold text-[var(--g-muted)]"> | {inc}</span>}
                  </span>
                  <span className="g-muted mt-1 text-[11px] font-semibold">{inc === "0" ? "min" : "min + sec"}</span>
                  {waiting > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--g-good)]/20 px-1.5 text-[10px] font-bold text-[var(--g-good)]" title={`${waiting} waiting`}>
                      {waiting}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
