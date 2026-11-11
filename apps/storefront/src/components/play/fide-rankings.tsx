"use client"

import { useEffect, useState } from "react"
import { GAME_URL } from "@/lib/game-types"

// FIDE's official rankings (top 100 active players), from FIDE's monthly rating list.

type Row = { rank: number; fide_id: number; name: string; fed: string; title: string | null; rating: number; games: number; birth_year: number | null }
type Data = { period: string | null; players: Row[] }

const LISTS = [
  ["open", "Open"],
  ["women", "Women"],
  ["juniors", "Juniors"],
  ["girls", "Girls"],
  ["india", "India"],
  ["india_women", "India women"],
] as const
const SPEEDS = [
  ["standard", "Standard"],
  ["rapid", "Rapid"],
  ["blitz", "Blitz"],
] as const
type List = (typeof LISTS)[number][0]
type Speed = (typeof SPEEDS)[number][0]

const Tabs = <T extends string>({ items, value, onChange, label }: { items: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string }) => (
  <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
    {items.map(([v, text]) => (
      <button key={v} role="tab" type="button" aria-selected={value === v} onClick={() => onChange(v)} className="g-choice h-[38px] shrink-0 px-4 text-[14px] font-semibold">
        {text}
      </button>
    ))}
  </div>
)

// Age this year. Only worked out once the list has loaded in the browser (not while the page
// is being built), so the date is read then.
const ageOf = (born: number) => new Date().getFullYear() - born

export function FideRankings() {
  const [list, setList] = useState<List>("open")
  const [speed, setSpeed] = useState<Speed>("standard")
  const [data, setData] = useState<{ key: string; d: Data | null } | null>(null)
  const key = `${speed}:${list}`

  useEffect(() => {
    let live = true
    void fetch(`${GAME_URL}/game/fide?speed=${speed}&list=${list}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => live && setData({ key: `${speed}:${list}`, d }))
      .catch(() => live && setData({ key: `${speed}:${list}`, d: null }))
    return () => {
      live = false
    }
  }, [speed, list])

  const current = data?.key === key ? data.d : undefined

  return (
    <div>
      <Tabs label="Ranking" items={LISTS} value={list} onChange={setList} />
      <div className="mt-2">
        <Tabs label="Time control" items={SPEEDS} value={speed} onChange={setSpeed} />
      </div>
      <div className="g-panel mt-4 overflow-hidden">
        {current === undefined ? (
          <p className="g-muted px-4 py-10 text-center">Loading…</p>
        ) : !current?.players.length ? (
          <p className="g-muted px-4 py-10 text-center">The FIDE list is being downloaded. Check back in a few minutes.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-[var(--g-panel-2)] text-left text-[12px] text-[var(--g-muted)]">
              <tr>
                <th className="w-[52px] px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Player</th>
                <th className="hidden w-[70px] px-3 py-2.5 font-medium sm:table-cell">Fed</th>
                <th className="hidden w-[70px] px-3 py-2.5 text-right font-medium md:table-cell">Age</th>
                <th className="w-[80px] px-3 py-2.5 text-right font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {current.players.map((p) => (
                <tr key={p.fide_id} className="border-t border-[var(--g-line)]">
                  <td className="g-muted px-3 py-2.5 tabular-nums">{p.rank}</td>
                  <td className="px-3 py-2.5">
                    <a href={`https://ratings.fide.com/profile/${p.fide_id}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                      {p.title && <span className="shrink-0 rounded-[4px] bg-[var(--g-accent)] px-1.5 text-[11px] font-extrabold leading-[18px] text-black">{p.title}</span>}
                      <span className="truncate">{p.name}</span>
                      <span className="g-muted shrink-0 text-[12px] sm:hidden">{p.fed}</span>
                    </a>
                  </td>
                  <td className="g-muted hidden px-3 py-2.5 sm:table-cell">{p.fed}</td>
                  <td className="g-muted hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{p.birth_year ? ageOf(p.birth_year) : ""}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="g-muted mt-3 text-[12px]">
        Source: FIDE rating list{current?.period ? `, ${current.period}` : ""}. Active players only. Names link to each player&apos;s FIDE profile.
      </p>
    </div>
  )
}
