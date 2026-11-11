"use client"

import { Avatar } from "@/components/play/avatar"
import { speedOf } from "@/lib/game-types"
import type { Seeker } from "./screen"

const COLUMNS = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "classical", label: "Classical" },
] as const
const ROWS = 5

// The lobby board: who's waiting for a game right now, by speed. Each tile shows a waiting
// player's picture, rating and time; picking one joins that time control (and so is paired
// with them). Empty places stay as quiet blank tiles.
export function OpponentBoard({ seekers, onPick, disabled }: { seekers: Seeker[]; onPick: (tc: string) => void; disabled?: boolean }) {
  return (
    <div className="opp-board menu-rise [animation-delay:60ms]">
      {COLUMNS.map((c) => {
        const list = seekers
          .filter((s) => {
            const [m, i] = s.tc.split("+").map(Number)
            return speedOf(m * 60000, i * 1000) === c.key
          })
          .sort((a, b) => a.since - b.since)
          .slice(0, ROWS)
        return (
          <div key={c.key} className="min-w-0">
            <p className="mb-3 text-[18px] font-medium">{c.label}</p>
            <div className="flex flex-col gap-2.5">
              {list.map((s, i) => {
                const [min, inc] = s.tc.split("+")
                return (
                  <button key={`${s.tc}-${s.since}-${i}`} type="button" disabled={disabled} onClick={() => onPick(s.tc)} className="opp-tile opp-tile-on">
                    <Avatar url={s.avatar_url} name={s.guest ? "Guest" : "Player"} size={36} className="[&>*]:!rounded-full" />
                    <span className="text-[13px] font-medium">{s.guest ? "Guest" : s.rating}</span>
                    <span className="ml-auto flex items-start font-semibold leading-none">
                      <span className="text-[30px] tracking-[-0.04em]">{inc === "0" ? min : `${min}+${inc}`}</span>
                      {inc === "0" && <span className="ml-0.5 text-[12px] font-medium">min</span>}
                    </span>
                  </button>
                )
              })}
              {Array.from({ length: ROWS - list.length }, (_, i) => (
                <span key={`e${i}`} className="opp-tile" aria-hidden="true" />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
