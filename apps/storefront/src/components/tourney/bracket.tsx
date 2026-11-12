import Link from "next/link"
import type { BracketMatch, TourneyView } from "@/lib/tournament-types"

const CARD_H = 74
const GAP = 18
const COL_W = 236
const COL_GAP = 56
const UNIT = CARD_H + GAP

const DECIDED: Record<string, string> = { bye: "Bye", armageddon: "Sudden death", forfeit: "Forfeit", seed: "Higher seed" }

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n === 0.5 ? "½" : `${Math.floor(n)}½`)

function Side({ s, score, won, lost, me, empty = "To be decided" }: { s: BracketMatch["a"]; score: number | null; won: boolean; lost: boolean; me: boolean; empty?: string }) {
  return (
    <span className={`flex h-[34px] items-center gap-2 px-2.5 ${won ? "text-[var(--g-text)]" : lost ? "text-white/35" : "text-white/85"} ${me ? "bg-[var(--g-accent)]/10" : ""}`}>
      <span className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] font-bold tabular-nums ${won ? "bg-[var(--g-accent)] text-black" : "bg-white/10 text-white/60"}`}>{s?.seed ?? "–"}</span>
      <span className={`min-w-0 flex-1 truncate text-[14px] ${won ? "font-bold" : "font-medium"}`}>{s ? s.name : <span className="italic text-white/35">{empty}</span>}</span>
      {s?.rating != null && <span className="text-[11px] tabular-nums text-white/40">{s.rating}</span>}
      <span className={`w-6 text-right text-[15px] font-extrabold tabular-nums ${won ? "text-[var(--g-accent)]" : ""}`}>{score == null ? "" : fmt(score)}</span>
    </span>
  )
}

// A knockout bracket: one column per round, every match a scoreboard card, lines joining
// winners to their next match. The path to the trophy lights up as matches are decided.
export function Bracket({ view, meId }: { view: TourneyView; meId: string | null }) {
  const b = view.bracket
  if (!b) return null
  const first = b.rounds[0]?.matches.length ?? 1
  const height = first * UNIT
  const topOf = (round: number, i: number) => {
    const span = 2 ** (round - 1)
    return (i * span + (span - 1) / 2) * UNIT
  }
  const champion = view.champion ? view.entrants.find((e) => e.id === view.champion) : null
  const width = b.rounds.length * (COL_W + COL_GAP) + 220

  return (
    <div className="overflow-x-auto pb-3 [scrollbar-width:thin]">
      <div className="relative" style={{ width, height: height + 36 }}>
        {b.rounds.map((r) => (
          <div key={r.round} className="absolute top-0 text-[13px] font-bold text-[var(--g-muted)]" style={{ left: (r.round - 1) * (COL_W + COL_GAP), width: COL_W }}>
            {r.name}
            {view.state?.round === r.round && view.state.phase === "running" && <span className="ml-2 rounded bg-[#ff3b3b] px-1.5 py-[1px] text-[10px] font-extrabold text-white">NOW</span>}
          </div>
        ))}
        <svg className="pointer-events-none absolute left-0 top-[36px]" width={width} height={height} aria-hidden="true">
          {b.rounds.slice(1).map((r) =>
            r.matches.map((m, i) => {
              const x2 = (r.round - 1) * (COL_W + COL_GAP)
              const x1 = x2 - COL_GAP
              const y2 = topOf(r.round, i) + CARD_H / 2
              const feeders = [b.rounds[r.round - 2].matches[i * 2], b.rounds[r.round - 2].matches[i * 2 + 1]]
              return feeders.map((f, k) => {
                if (!f) return null
                const y1 = topOf(r.round - 1, i * 2 + k) + CARD_H / 2
                const lit = !!f.winner
                const mid = x1 + COL_GAP / 2
                return <path key={`${r.round}-${i}-${k}`} d={`M${x1} ${y1} H${mid} V${y2} H${x2}`} fill="none" stroke={lit ? "#ffb300" : "rgba(255,255,255,0.14)"} strokeWidth={lit ? 2 : 1.5} />
              })
            })
          )}
          {b.rounds.length > 0 && (
            <path
              d={`M${(b.rounds.length - 1) * (COL_W + COL_GAP) + COL_W} ${topOf(b.rounds.length, 0) + CARD_H / 2} h${COL_GAP - 8}`}
              stroke={champion ? "#ffb300" : "rgba(255,255,255,0.14)"}
              strokeWidth={2}
            />
          )}
        </svg>
        {b.rounds.map((r) =>
          r.matches.map((m, i) => {
            const last = [...m.games].reverse().find((g) => g.game_id)
            const href = last?.game_id ? (last.live ? `/play/${last.game_id}` : `/play/analysis/${last.game_id}`) : null
            const done = !!m.winner
            const meIn = !!meId && (m.a?.id === meId || m.b?.id === meId)
            const card = (
              <span
                className={`block overflow-hidden rounded-lg border bg-[var(--g-panel)] transition ${m.live ? "border-[#ff3b3b] shadow-[0_0_18px_rgba(255,59,59,0.35)]" : meIn ? "border-[var(--g-accent)]/60" : "border-[var(--g-line)]"} ${href ? "hover:brightness-125" : ""}`}
                style={{ height: CARD_H - 4 }}
              >
                <Side s={m.a} score={m.a && m.b && (m.games.length || done) && m.decided_by !== "bye" ? m.score[0] : null} won={!!m.a && m.winner === m.a.id} lost={done && m.winner !== m.a?.id} me={!!meId && m.a?.id === meId} />
                <span className="block h-px bg-white/[0.07]" />
                <Side s={m.b} score={m.a && m.b && (m.games.length || done) ? m.score[1] : null} won={!!m.b && m.winner === m.b.id} lost={done && m.winner !== m.b?.id} me={!!meId && m.b?.id === meId} empty={m.decided_by === "bye" ? "Bye" : "To be decided"} />
              </span>
            )
            return (
              <div key={`${r.round}-${m.board}`} className="absolute" style={{ left: (r.round - 1) * (COL_W + COL_GAP), top: 36 + topOf(r.round, i), width: COL_W }}>
                {href ? (
                  <Link href={href} aria-label={`${m.a?.name ?? "?"} against ${m.b?.name ?? "?"}: ${m.live ? "watch live" : "replay"}`}>
                    {card}
                  </Link>
                ) : (
                  card
                )}
                <span className="absolute -top-[9px] right-2 flex gap-1">
                  {m.live && <span className="rounded bg-[#ff3b3b] px-1.5 text-[10px] font-extrabold leading-[16px] text-white">LIVE</span>}
                  {m.decided_by && m.decided_by !== "games" && <span className="rounded bg-[var(--g-panel-3)] px-1.5 text-[10px] font-semibold leading-[16px] text-white/75">{DECIDED[m.decided_by] ?? m.decided_by}</span>}
                  {m.games.length > 1 && <span className="rounded bg-[var(--g-panel-3)] px-1.5 text-[10px] font-semibold leading-[16px] text-white/75">{m.games.length} games</span>}
                </span>
              </div>
            )
          })
        )}
        <div className="absolute flex flex-col items-center text-center" style={{ left: b.rounds.length * (COL_W + COL_GAP) - 8, top: 36 + topOf(b.rounds.length, 0) - 40, width: 200 }}>
          <span className={`grid h-[76px] w-[76px] place-items-center rounded-full text-[38px] ${champion ? "bg-[var(--g-accent)] shadow-[0_0_40px_rgba(255,179,0,0.55)]" : "bg-[var(--g-panel-2)] grayscale"}`} aria-hidden="true">
            🏆
          </span>
          <span className="mt-2 text-[12px] font-semibold text-[var(--g-muted)]">Champion</span>
          <span className="max-w-full truncate text-[17px] font-extrabold">{champion?.name ?? "?"}</span>
        </div>
      </div>
    </div>
  )
}
