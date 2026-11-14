export type ArenaRow = {
  // null: not enough games yet to be ranked
  rank: number | null
  player_id: string
  name: string
  score: number
  games: number
  sheet: number[]
  on_fire: boolean
  status: "playing" | "waiting" | "away"
}

export type ArenaState = {
  id: string
  title: string
  handle: string
  time_control: string
  starts_at: number
  ends_at: number
  phase: "before" | "live" | "over" | "cancelled"
  // Staff paused it: no new games start.
  paused?: boolean
  server_now: number
  standings: ArenaRow[]
  playing_now: number
  // "challenge": players challenge each other in the lobby; min_games to be ranked.
  pairing?: "auto" | "challenge"
  min_games?: number
}

export type ArenaYou = { joined: boolean; waiting: boolean; game_id: string | null; paused: boolean } | null

const PODIUM = ["#f5c542", "#c9ced6", "#d08a4f"]

// Arena leaderboard: the top three on a podium, then everyone else.
export function ArenaTable({ arena, meId }: { arena: ArenaState; meId: string | null }) {
  const rows = arena.standings
  if (!rows.length) return <p className="g-muted py-8 text-center">{arena.phase === "before" ? "The leaderboard fills up once the arena starts." : "Nobody has played yet."}</p>
  const podium = rows.filter((r) => r.rank != null).slice(0, 3)
  const need = Math.max(1, arena.min_games ?? 1)
  return (
    <div>
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {[podium[1], podium[0], podium[2]].map((r, i) =>
          r ? (
            <div key={r.player_id} className="flex flex-col items-center text-center">
              <span className="max-w-full truncate text-[14px] font-bold sm:text-[16px]">{r.name}</span>
              <span className="text-[13px] tabular-nums text-[var(--g-muted)]">{r.score} pts</span>
              <span
                className="mt-2 flex w-full items-start justify-center rounded-t-lg pt-2 text-[22px] font-extrabold text-black"
                style={{ background: PODIUM[(r.rank ?? 1) - 1], height: r.rank === 1 ? 96 : r.rank === 2 ? 72 : 56 }}
              >
                {r.rank}
              </span>
            </div>
          ) : (
            <span key={i} />
          )
        )}
      </div>
      <table className="mt-5 w-full text-[14px]">
        <thead>
          <tr className="border-b border-[var(--g-line)] text-left text-[12px] text-[var(--g-muted)]">
            <th className="w-10 py-2 font-semibold">#</th>
            <th className="py-2 font-semibold">Player</th>
            <th className="hidden py-2 font-semibold sm:table-cell">Recent games</th>
            <th className="py-2 text-right font-semibold">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className={`border-b border-[var(--g-line)] ${r.player_id === meId ? "bg-[var(--g-accent)]/10" : ""}`}>
              <td className={`py-2.5 font-extrabold tabular-nums ${r.rank != null && r.rank <= 3 ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}>{r.rank ?? "–"}</td>
              <td className="py-2.5">
                <span className="font-semibold">{r.name}</span>
                {r.on_fire && <span className="ml-2 rounded bg-[#c6542f] px-1.5 py-0.5 text-[11px] font-semibold text-white">🔥 on fire</span>}
                {r.status === "playing" && <span className="ml-2 text-[12px] font-semibold text-[#ff6b6b]">playing</span>}
                {r.rank == null && (
                  <span className="ml-2 text-[12px] text-[var(--g-muted)]">
                    {r.games} of {need} games to be ranked
                  </span>
                )}
              </td>
              <td className="hidden py-2.5 sm:table-cell">
                <span className="flex gap-1">
                  {r.sheet.map((p, i) => (
                    <span key={i} className={`grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] font-bold ${p >= 2 ? "bg-[var(--g-good)] text-black" : p === 1 ? "bg-white/25" : "bg-[var(--g-bad)]/70 text-black"}`}>
                      {p}
                    </span>
                  ))}
                </span>
              </td>
              <td className="py-2.5 text-right text-[18px] font-extrabold tabular-nums">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-[var(--g-muted)]">
        A win scores 2, a draw 1. Two wins in a row and you&apos;re on fire: double points until you stop winning.
        {need > 1 ? ` Play at least ${need} games to be ranked and win a prize.` : ""}
      </p>
    </div>
  )
}
