import { pool } from "../db.js"
import { isGuest } from "../game.js"
import { type Speed, speedOf } from "../glicko.js"
import { isHouse } from "./persona.js"
import { targetFrom } from "./level.js"

export { houseWaitMs, targetFrom } from "./level.js"

// Choosing a House Player's level for someone waiting.

export const targetRating = async (playerId: string, speed: Speed, rating: number) => {
  if (isGuest(playerId)) return 1100
  const { rows } = await pool.query(
    `select white_id, black_id, result, white_rating, black_rating, initial_ms, increment_ms
       from play.game where (white_id = $1 or black_id = $1) and status = 'finished' and mode in ('online', 'arena') and result is not null
      order by ended_at desc limit 30`,
    [playerId]
  )
  const same = rows.filter((g) => speedOf(g.initial_ms, g.increment_ms) === speed)
  const recent = same.slice(0, 6).map((g) => {
    const white = g.white_id === playerId
    const score = g.result === "1/2-1/2" ? 0.5 : (g.result === "1-0") === white ? 1 : 0
    return { score, opp: (white ? g.black_rating : g.white_rating) ?? rating, house: isHouse(white ? g.black_id : g.white_id) }
  })
  return targetFrom({ rating, games: same.length, recent })
}
