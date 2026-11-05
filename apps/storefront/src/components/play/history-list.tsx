"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { GAME_URL, SPEED_LABEL, speedOf, tcText } from "@/lib/game-types"

type Row = {
  id: string
  mode: string
  white_id: string | null
  white_name: string | null
  black_id: string | null
  black_name: string | null
  initial_ms: number
  increment_ms: number
  result: string | null
  reason: string | null
  plies: number
  ended_at: string
  rated: boolean
  white_rating: number | null
  black_rating: number | null
  white_diff: number | null
  black_diff: number | null
}

const REASON: Record<string, string> = {
  checkmate: "Checkmate",
  resign: "Resignation",
  timeout: "Time",
  stalemate: "Stalemate",
  insufficient: "Insufficient material",
  threefold: "Repetition",
  "fifty-moves": "50-move rule",
  agreement: "Agreement",
  abandoned: "Abandoned",
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso))

const fetchPage = async (playerId: string, before?: string) => {
  const q = new URLSearchParams({ limit: "25", ...(before ? { before } : {}) })
  const d = (await fetch(`${GAME_URL}/game/players/${playerId}/games?${q}`).then((r) => r.json())) as { games: Row[] }
  return d.games
}

// A player's finished games, newest first. Each opens in the replay board.
export function HistoryList({ playerId }: { playerId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [more, setMore] = useState(true)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)

  const take = useCallback((games: Row[], fresh = false) => {
    setRows((r) => (fresh ? games : [...r, ...games]))
    setMore(games.length === 25)
    setBusy(false)
  }, [])
  const fail = useCallback(() => {
    setFailed(true)
    setBusy(false)
  }, [])

  useEffect(() => {
    fetchPage(playerId).then((g) => take(g, true), fail)
  }, [playerId, take, fail])

  const loadMore = (before?: string) => {
    setBusy(true)
    fetchPage(playerId, before).then(take, fail)
  }

  if (failed && !rows.length) return <p className="py-10 text-center g-muted">Couldn&apos;t load your games. Please try again later.</p>
  if (!busy && !rows.length)
    return (
      <div className="g-panel px-6 py-12 text-center">
        <p className="text-[16px]">No finished games yet.</p>
        <Link href="/play" className="g-btn g-btn-primary mt-5">
          Play a game
        </Link>
      </div>
    )

  return (
    <div>
      <div className="g-panel overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-[var(--g-panel-2)] text-left text-[12px] text-[var(--g-muted)]">
            <tr>
              <th className="px-3 py-2.5 font-medium">Game</th>
              <th className="px-3 py-2.5 font-medium">Players</th>
              <th className="px-3 py-2.5 text-center font-medium">Result</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Moves</th>
              <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Date</th>
              <th className="px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const me: "w" | "b" = g.white_id === playerId ? "w" : "b"
              const score = g.result === "1/2-1/2" ? "draw" : (g.result === "1-0") === (me === "w") ? "win" : "loss"
              const diff = me === "w" ? g.white_diff : g.black_diff
              const kind = g.mode === "computer" ? "vs Computer" : `${SPEED_LABEL[speedOf(g.initial_ms, g.increment_ms)]} ${tcText(g.initial_ms, g.increment_ms)}`
              const player = (name: string | null, rating: number | null, d: number | null, colour: "w" | "b") => (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/25 ${colour === "w" ? "bg-white" : "bg-[#3b3835]"}`} />
                  <span className="truncate">{name}</span>
                  {rating != null && <span className="g-muted">({rating})</span>}
                  {d != null && d !== 0 && <span className={`text-[12px] ${d > 0 ? "text-[#7bd88f]" : "text-[#ff8a7d]"}`}>{d > 0 ? `+${d}` : d}</span>}
                </span>
              )
              return (
                <tr key={g.id} className="border-t border-[var(--g-line)] transition hover:bg-white/[0.04]">
                  <td className="px-3 py-2.5 align-middle">
                    <Link href={`/play/${g.id}`} className="block">
                      <span className="block font-medium">{kind}</span>
                      <span className="block text-[12px] g-muted">
                        {g.mode === "arena" ? "Arena" : g.mode === "computer" ? "Casual" : g.rated ? "Rated" : "Casual"}
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <Link href={`/play/${g.id}`} className="block min-w-0">
                      {player(g.white_name, g.white_rating, g.white_diff, "w")}
                      {player(g.black_name, g.black_rating, g.black_diff, "b")}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      title={g.reason ? REASON[g.reason] : undefined}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded text-[13px] font-bold text-white ${
                        score === "win" ? "bg-[#3f8f3a]" : score === "loss" ? "bg-[#b23b31]" : "bg-[#8a8580]"
                      }`}
                    >
                      {score === "win" ? "W" : score === "loss" ? "L" : "½"}
                    </span>
                    <span className="block text-[11px] g-muted">{g.reason ? REASON[g.reason] : ""}</span>
                    {diff != null && <span className="sr-only">Rating change {diff}</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right sm:table-cell">{Math.ceil(g.plies / 2)}</td>
                  <td className="hidden px-3 py-2.5 text-right g-muted md:table-cell">{when(g.ended_at)}</td>
                  <td className="px-2 py-2.5 text-right">
                    {g.plies >= 2 && (
                      <Link href={`/play/analysis/${g.id}`} className="g-btn !min-h-[32px] !px-2.5 !text-[12px]" aria-label="Game review">
                        ★<span className="hidden sm:inline"> Review</span>
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {more && (
        <button type="button" disabled={busy} className="g-btn mt-4 w-full disabled:opacity-60" onClick={() => loadMore(rows[rows.length - 1]?.ended_at)}>
          {busy ? "Loading…" : "Show older games"}
        </button>
      )}
    </div>
  )
}
