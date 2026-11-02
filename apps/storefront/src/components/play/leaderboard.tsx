"use client"

import { useEffect, useState } from "react"
import { GAME_URL, SPEED_LABEL, type Speed } from "@/lib/game-types"

type Row = { player_id: string; name: string; rating: number; provisional: boolean; games: number; wins: number; draws: number; losses: number }
const SPEEDS: Speed[] = ["bullet", "blitz", "rapid", "classical"]

export function Leaderboard({ meId }: { meId: string | null }) {
  const [speed, setSpeed] = useState<Speed>("blitz")
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let live = true
    void fetch(`${GAME_URL}/game/leaderboard?speed=${speed}`)
      .then((r) => r.json())
      .then((d) => live && setRows(d.players ?? []))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [speed])

  return (
    <div>
      <div role="tablist" className="flex gap-2 overflow-x-auto">
        {SPEEDS.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={speed === s}
            onClick={() => {
              setRows(null)
              setSpeed(s)
            }}
            className="g-choice h-[40px] px-4 text-[14px] font-semibold"
          >
            {SPEED_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="mt-4 g-panel overflow-hidden">
        {rows == null ? (
          <p className="px-4 py-10 text-center g-muted">Loading…</p>
        ) : rows.length ? (
          <table className="w-full text-[14px]">
            <thead className="bg-[var(--g-panel-2)] text-left text-[12px] text-[var(--g-muted)]">
              <tr>
                <th className="w-[56px] px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Player</th>
                <th className="px-3 py-2.5 text-right font-medium">Rating</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Won / drawn / lost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player_id} className={`border-t border-[var(--g-line)] ${r.player_id === meId ? "bg-[var(--g-panel-3)]" : ""}`}>
                  <td className="px-3 py-2.5 g-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">
                    <a href={`/play/player/${r.player_id}`} className="hover:underline">
                      {r.name}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[18px] font-bold">
                    {r.rating}
                    {r.provisional && <span className="text-[13px] g-muted">?</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right g-muted sm:table-cell">
                    {r.wins} / {r.draws} / {r.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-10 text-center g-muted">No rated {SPEED_LABEL[speed].toLowerCase()} games yet. Be the first!</p>
        )}
      </div>
      <p className="mt-3 text-[13px] g-muted">A &quot;?&quot; means the rating is still settling: it becomes firm after a few more games.</p>
    </div>
  )
}
