"use client"

import Link from "next/link"
import { useState } from "react"
import type { TourneyView } from "@/lib/tournament-types"

const half = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ""}½`)
const MARK: Record<string, { label: string; cls: string }> = {
  W: { label: "1", cls: "bg-[var(--g-good)] text-black" },
  F: { label: "1", cls: "bg-[var(--g-good)]/60 text-black" },
  D: { label: "½", cls: "bg-white/25 text-white" },
  L: { label: "0", cls: "bg-[var(--g-bad)]/80 text-black" },
  X: { label: "0", cls: "bg-[var(--g-bad)]/50 text-black" },
  B: { label: "B", cls: "bg-[var(--g-accent)]/70 text-black" },
}

// Swiss (and round-robin) standings with tie-breaks and each player's round-by-round results.
export function SwissStandings({ view, meId, roundRobin = false }: { view: TourneyView; meId: string | null; roundRobin?: boolean }) {
  const rows = view.standings ?? []
  if (!rows.length) return <p className="g-muted py-6 text-center">Standings appear after the first round.</p>
  const rounds = view.rounds ?? 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead>
          <tr className="border-b border-[var(--g-line)] text-left text-[12px] text-[var(--g-muted)]">
            <th className="w-10 py-2 font-semibold">#</th>
            <th className="py-2 font-semibold">Player</th>
            <th className="py-2 font-semibold">Rounds</th>
            <th className="w-14 py-2 text-right font-semibold">Points</th>
            {!roundRobin && (
              <th className="w-16 py-2 text-right font-semibold" title="Buchholz (cut 1): opponents' points">
                Buch.
              </th>
            )}
            <th className="w-14 py-2 text-right font-semibold" title="Sonneborn-Berger">
              SB
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-[var(--g-line)] ${r.id === meId ? "bg-[var(--g-accent)]/10" : ""} ${r.withdrawn ? "opacity-50" : ""}`}>
              <td className={`py-2.5 font-extrabold tabular-nums ${r.rank <= 3 ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}>{r.rank}</td>
              <td className="py-2.5">
                <span className="font-semibold">{r.name}</span>
                <span className="ml-2 text-[12px] tabular-nums text-[var(--g-muted)]">{r.rating}</span>
                {r.withdrawn && <span className="ml-2 text-[12px] text-[var(--g-muted)]">withdrawn</span>}
              </td>
              <td className="py-2.5">
                <span className="flex gap-1">
                  {Array.from({ length: rounds }, (_, i) => {
                    const s = r.sheet.find((x) => x.round === i + 1)
                    const m = s ? MARK[s.mark] : null
                    const cell = (
                      <span className={`grid h-6 w-6 place-items-center rounded text-[12px] font-bold ${m ? m.cls : "bg-white/[0.06] text-white/25"}`} title={s ? `Round ${s.round}: ${s.mark === "B" ? "bye" : s.colour === "w" ? "White" : "Black"}` : `Round ${i + 1}`}>
                        {m?.label ?? ""}
                      </span>
                    )
                    return s?.game_id ? (
                      <Link key={i} href={`/play/analysis/${s.game_id}`} aria-label={`Round ${s.round} game`}>
                        {cell}
                      </Link>
                    ) : (
                      <span key={i}>{cell}</span>
                    )
                  })}
                </span>
              </td>
              <td className="py-2.5 text-right text-[17px] font-extrabold tabular-nums">{half(r.points)}</td>
              {!roundRobin && <td className="py-2.5 text-right tabular-nums text-[var(--g-muted)]">{half(r.buchholz)}</td>}
              <td className="py-2.5 text-right tabular-nums text-[var(--g-muted)]">{half(r.sb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-[var(--g-muted)]">
        {roundRobin ? "Ties are split by Sonneborn-Berger, then wins." : "Ties are split by Buchholz (cut 1), then Sonneborn-Berger, then wins."} B: a bye (1 point). Tap a result to replay the game.
      </p>
    </div>
  )
}

// Every round's boards: who plays whom, and the result.
export function SwissPairings({ view, meId }: { view: TourneyView; meId: string | null }) {
  const rounds = view.pairings ?? []
  const [open, setOpen] = useState<number | null>(null)
  const current = open ?? rounds.at(-1)?.round ?? 1
  const shown = rounds.find((r) => r.round === current)
  if (!rounds.length) return <p className="g-muted py-6 text-center">Pairings appear when round 1 starts.</p>
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Round">
        {rounds.map((r) => (
          <button
            key={r.round}
            type="button"
            role="tab"
            aria-selected={r.round === current}
            onClick={() => setOpen(r.round)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold ${r.round === current ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel-2)] text-[var(--g-muted)] hover:text-white"}`}
          >
            Round {r.round}
          </button>
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {shown?.games.map((g) => {
          const href = g.game_id ? (g.live ? `/play/${g.game_id}` : `/play/analysis/${g.game_id}`) : null
          const res = g.result === "bye" ? "Bye" : g.result === "1/2-1/2" ? "½ – ½" : g.result === "1-0" ? "1 – 0" : g.result === "0-1" ? "0 – 1" : g.live ? "LIVE" : "–"
          const meIn = !!meId && (g.white?.id === meId || g.black?.id === meId)
          const row = (
            <span className={`grid grid-cols-[34px_1fr_auto_1fr] items-center gap-3 rounded-lg border px-3 py-2.5 ${meIn ? "border-[var(--g-accent)]/60 bg-[var(--g-accent)]/[0.07]" : "border-[var(--g-line)] bg-[var(--g-panel)]"} ${href ? "hover:brightness-125" : ""}`}>
              <span className="text-[12px] font-bold text-[var(--g-muted)]">#{g.board}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-white/40 bg-white" aria-label="White" />
                <span className="truncate font-semibold">{g.white?.name}</span>
              </span>
              <span className={`min-w-[64px] rounded px-2 py-1 text-center text-[14px] font-extrabold tabular-nums ${g.live ? "bg-[#ff3b3b] text-white" : "bg-black/30"}`}>{res}</span>
              <span className="flex min-w-0 items-center justify-end gap-2">
                <span className="truncate font-semibold">{g.black?.name ?? <span className="text-[var(--g-muted)]">—</span>}</span>
                {g.black && <span className="h-3 w-3 shrink-0 rounded-sm border border-white/40 bg-black" aria-label="Black" />}
              </span>
            </span>
          )
          return (
            <li key={g.board}>
              {href ? (
                <Link href={href} className="block">
                  {row}
                </Link>
              ) : (
                row
              )}
              {g.forfeit && <span className="ml-12 text-[12px] text-[var(--g-muted)]">Won by forfeit (the opponent didn&apos;t play)</span>}
              {g.fixed && <span className="ml-12 text-[12px] text-[var(--g-muted)]">Result corrected by the arbiter</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Round robin: everyone's result against everyone, in standings order. Read across: the row
// player's score against each column player (two results in a double round robin).
export function Crosstable({ view, meId }: { view: TourneyView; meId: string | null }) {
  const rows = view.standings ?? []
  if (!rows.length) return <p className="g-muted py-6 text-center">The crosstable fills in as games finish.</p>
  const cell = "h-9 min-w-9 border border-[var(--g-line)] px-1 text-center"
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[13px]">
        <thead>
          <tr className="text-[12px] text-[var(--g-muted)]">
            <th className="sticky left-0 z-10 bg-[var(--g-bg)] pr-3 text-left font-semibold">Player</th>
            {rows.map((r, i) => (
              <th key={r.id} className={`${cell} font-semibold ${r.id === meId ? "text-[var(--g-accent)]" : ""}`} title={r.name}>
                {i + 1}
              </th>
            ))}
            <th className="w-14 pl-3 text-right font-semibold">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.withdrawn ? "opacity-50" : ""}>
              <th scope="row" className={`sticky left-0 z-10 max-w-[180px] truncate bg-[var(--g-bg)] py-1 pr-3 text-left font-semibold ${r.id === meId ? "text-[var(--g-accent)]" : ""}`}>
                <span className="mr-2 inline-block w-5 text-right tabular-nums text-[var(--g-muted)]">{i + 1}</span>
                {r.name}
              </th>
              {rows.map((c) => {
                if (c.id === r.id) return <td key={c.id} className={`${cell} bg-white/[0.08]`} aria-label="—" />
                const met = r.sheet.filter((x) => x.opponent === c.id)
                return (
                  <td key={c.id} className={`${cell} ${met.length ? "" : "text-white/20"}`} title={`${r.name} v ${c.name}`}>
                    {met.length ? (
                      <span className="flex justify-center gap-0.5">
                        {met.map((x) => {
                          const m = MARK[x.mark]
                          const chip = <span className={`grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] font-bold ${m?.cls ?? ""}`}>{m?.label ?? "?"}</span>
                          return x.game_id ? (
                            <Link key={x.round} href={`/play/analysis/${x.game_id}`} aria-label={`Round ${x.round}: replay`}>
                              {chip}
                            </Link>
                          ) : (
                            <span key={x.round}>{chip}</span>
                          )
                        })}
                      </span>
                    ) : (
                      "·"
                    )}
                  </td>
                )
              })}
              <td className="pl-3 text-right text-[16px] font-extrabold tabular-nums">{half(r.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-[var(--g-muted)]">Read across: each player&apos;s result against the numbered player above. Tap a result to replay the game.</p>
    </div>
  )
}
