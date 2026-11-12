import Link from "next/link"
import type { TStats } from "@/lib/tournament-types"

const ENDINGS: Record<string, string> = {
  checkmate: "Checkmate",
  resign: "Resigned",
  timeout: "On time",
  agreement: "Draw agreed",
  stalemate: "Stalemate",
  threefold: "Repetition",
  "fifty-moves": "50-move rule",
  insufficient: "Not enough pieces",
  abandoned: "Left the game",
}

// The tournament in numbers.
export function TourneyStats({ stats }: { stats: TStats }) {
  if (!stats.games) return <p className="g-muted py-8 text-center">Numbers appear once games finish.</p>
  const w = stats.white_wins ?? 0
  const d = stats.draws ?? 0
  const b = stats.black_wins ?? 0
  const pct = (n: number) => Math.round((n / stats.games) * 100)
  const tiles = [
    { label: "Games played", value: stats.games.toLocaleString("en-IN") },
    { label: "Decisive", value: `${pct(w + b)}%` },
    { label: "Average length", value: `${stats.average_moves ?? 0} moves` },
    { label: "Most wins", value: stats.most_wins ? `${stats.most_wins.name}` : "–", sub: stats.most_wins ? `${stats.most_wins.wins} wins` : undefined },
  ]
  const endings = Object.entries(stats.endings ?? {}).sort((x, y) => y[1] - x[1])
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-4">
            <p className="text-[12px] font-semibold text-[var(--g-muted)]">{t.label}</p>
            <p className="mt-1 truncate text-[24px] font-extrabold tabular-nums">{t.value}</p>
            {t.sub && <p className="text-[12px] text-[var(--g-muted)]">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div>
        <p className="text-[14px] font-bold">Results by colour</p>
        <div className="mt-2 flex h-9 overflow-hidden rounded-lg text-[13px] font-bold" role="img" aria-label={`White won ${pct(w)}%, draws ${pct(d)}%, Black won ${pct(b)}%`}>
          {w > 0 && (
            <span className="flex items-center justify-center bg-[#f3f2ef] text-black" style={{ width: `${pct(w)}%` }}>
              {pct(w)}%
            </span>
          )}
          {d > 0 && (
            <span className="flex items-center justify-center bg-[#7d7a73] text-white" style={{ width: `${pct(d)}%` }}>
              {pct(d)}%
            </span>
          )}
          {b > 0 && (
            <span className="flex items-center justify-center bg-black text-white ring-1 ring-inset ring-white/15" style={{ width: `${pct(b)}%` }}>
              {pct(b)}%
            </span>
          )}
        </div>
        <p className="mt-1.5 flex gap-4 text-[12px] text-[var(--g-muted)]">
          <span>White won {w}</span>
          <span>Draws {d}</span>
          <span>Black won {b}</span>
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {stats.fastest && (
          <Link href={`/play/analysis/${stats.fastest.game_id}`} className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-4 hover:brightness-125">
            <p className="text-[12px] font-semibold text-[var(--g-muted)]">⚡ Fastest win</p>
            <p className="mt-1 text-[17px] font-extrabold">{stats.fastest.winner}</p>
            <p className="text-[13px] text-[var(--g-muted)]">in {stats.fastest.moves} moves · Replay</p>
          </Link>
        )}
        {stats.upset && (
          <Link href={`/play/analysis/${stats.upset.game_id}`} className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-4 hover:brightness-125">
            <p className="text-[12px] font-semibold text-[var(--g-muted)]">💥 Biggest upset</p>
            <p className="mt-1 text-[17px] font-extrabold">{stats.upset.winner}</p>
            <p className="text-[13px] text-[var(--g-muted)]">
              beat {stats.upset.loser}, rated {stats.upset.diff} higher · Replay
            </p>
          </Link>
        )}
        {stats.longest && (
          <Link href={`/play/analysis/${stats.longest.game_id}`} className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-4 hover:brightness-125">
            <p className="text-[12px] font-semibold text-[var(--g-muted)]">⏳ Longest game</p>
            <p className="mt-1 text-[17px] font-extrabold">{stats.longest.moves} moves</p>
            <p className="text-[13px] text-[var(--g-muted)]">Replay</p>
          </Link>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {!!stats.openings?.length && (
          <div>
            <p className="text-[14px] font-bold">Most played openings</p>
            <ul className="mt-2 space-y-2">
              {stats.openings.map((o) => (
                <li key={o.moves} className="text-[13px]">
                  <span className="flex justify-between">
                    <span>{o.name}</span>
                    <span className="tabular-nums text-[var(--g-muted)]">{o.count}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-[var(--g-accent)]" style={{ width: `${Math.round((o.count / stats.games) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {endings.length > 0 && (
          <div>
            <p className="text-[14px] font-bold">How games ended</p>
            <ul className="mt-2 space-y-2">
              {endings.map(([k, n]) => (
                <li key={k} className="text-[13px]">
                  <span className="flex justify-between">
                    <span>{ENDINGS[k] ?? k}</span>
                    <span className="tabular-nums text-[var(--g-muted)]">{n}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-white/60" style={{ width: `${Math.round((n / stats.games) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
