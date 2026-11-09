"use client"

import { TIME_CONTROLS } from "@/lib/game-types"

const GROUPS = ["Bullet", "Blitz", "Rapid", "Classical"] as const

// Time controls grouped by speed, as tiles.
export function TimeControlPicker({ value, onChange }: { value: string; onChange: (tc: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((g) => (
        <div key={g}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--g-muted)]">
            {g}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_CONTROLS.filter((t) => t.label === g).map((t) => (
              <button
                key={t.tc}
                type="button"
                aria-pressed={value === t.tc}
                onClick={() => onChange(t.tc)}
                className="g-choice h-[46px] text-[15px] font-bold"
              >
                {t.detail}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
