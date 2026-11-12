import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// A player's online rating for one speed, read from the game server's table (same database).
export const playRating = async (c: MedusaContainer, playerId: string, speed: string) => {
  const pg = c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as { raw: (q: string, b: unknown[]) => Promise<{ rows: { rating: number; games: number }[] }> }
  try {
    const { rows } = await pg.raw(`select rating, games from play.rating where player_id = ? and speed = ?`, [playerId, speed])
    return rows[0] ? { rating: Math.round(rows[0].rating), games: rows[0].games } : { rating: 1500, games: 0 }
  } catch {
    return { rating: 1500, games: 0 }
  }
}
