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
            className={`h-[40px] rounded-md px-4 text-[14px] font-medium ${speed === s ? "bg-velvet text-white" : "bg-linen hover:bg-maple-soft"}`}
          >
            {SPEED_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-rule">
        {rows == null ? (
          <p className="px-4 py-10 text-center text-muted">Loading…</p>
        ) : rows.length ? (
          <table className="w-full text-[14px]">
            <thead className="bg-linen text-left text-[12px] text-muted">
              <tr>
                <th className="w-[56px] px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Player</th>
                <th className="px-3 py-2.5 text-right font-medium">Rating</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Won / drawn / lost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player_id} className={`border-t border-rule ${r.player_id === meId ? "bg-maple-soft" : ""}`}>
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right font-display text-[18px]">
                    {r.rating}
                    {r.provisional && <span className="text-[13px] text-muted">?</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right text-muted sm:table-cell">
                    {r.wins} / {r.draws} / {r.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-10 text-center text-muted">No rated {SPEED_LABEL[speed].toLowerCase()} games yet. Be the first!</p>
        )}
      </div>
      <p className="mt-3 text-[13px] text-muted">A &quot;?&quot; means the rating is still settling: it becomes firm after a few more games.</p>
    </div>
  )
}
