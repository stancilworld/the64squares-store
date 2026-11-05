"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GAME_URL } from "@/lib/game-types"
import { type ReviewGame, ReviewView } from "./review-view"

type ServerGame = {
  id: string
  mode: string
  result: string | null
  moves: string[]
  white_id: string | null
  white_name: string | null
  white_rating: number | null
  black_id: string | null
  black_name: string | null
  black_rating: number | null
}

export const LOCAL_REVIEW_KEY = "t64:analyse"

// Loads the game to review: a finished game from the server, or (id "local") a game kept in
// this browser, such as an unsaved game against the computer.
export function ReviewLoader({ id, meId }: { id: string; meId: string | null }) {
  const [game, setGame] = useState<ReviewGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (id === "local") {
      const t = setTimeout(() => {
        try {
          const g = JSON.parse(window.sessionStorage.getItem(LOCAL_REVIEW_KEY) ?? "null") as Omit<ReviewGame, "key" | "back"> & { key?: string }
          if (!g?.moves?.length) throw new Error()
          setGame({ ...g, key: g.key ?? `local-${g.moves.join("")}`.slice(0, 120), back: "/play/computer" })
        } catch {
          setError("There's no game to review here.")
        }
      }, 0)
      return () => clearTimeout(t)
    }
    fetch(`${GAME_URL}/game/games/${encodeURIComponent(id)}/review`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { game: ServerGame }) => {
        if (!live) return
        const g = d.game
        setGame({
          key: g.id,
          white: g.white_name ?? (g.white_id === "computer" ? "Computer" : "White"),
          black: g.black_name ?? (g.black_id === "computer" ? "Computer" : "Black"),
          whiteRating: g.white_rating,
          blackRating: g.black_rating,
          result: g.result,
          moves: g.moves,
          me: meId ? (g.white_id === meId ? "w" : g.black_id === meId ? "b" : null) : null,
          back: `/play/${g.id}`,
        })
      })
      .catch(() => live && setError("This game can't be reviewed. Only finished games can."))
    return () => {
      live = false
    }
  }, [id, meId])

  if (error) {
    return (
      <div className="g-panel mx-auto mt-10 max-w-[480px] p-6 text-center">
        <p className="text-[16px]">{error}</p>
        <Link href="/play/history" className="g-btn g-btn-primary mt-5">
          My games
        </Link>
      </div>
    )
  }
  if (!game) return <p className="g-muted py-16 text-center">Loading the game…</p>
  if (game.moves.length < 2) {
    return (
      <div className="g-panel mx-auto mt-10 max-w-[480px] p-6 text-center">
        <p className="text-[16px]">This game is too short to review.</p>
      </div>
    )
  }
  return <ReviewView game={game} />
}
