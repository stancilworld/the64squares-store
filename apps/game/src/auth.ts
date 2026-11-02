import { jwtVerify } from "jose"
import { config } from "./config.js"
import type { Player } from "./game.js"

const key = new TextEncoder().encode(config.playTokenSecret)

// The storefront signs { sub: customer id, name } for 12 hours when a signed-in player
// opens a game page. Nothing else about the customer reaches the game server.
export const playerFromToken = async (token: unknown): Promise<Player | null> => {
  if (typeof token !== "string" || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: "the64squares-play" })
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("cus_")) return null
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 60) : "Player"
    return { id: payload.sub, name }
  } catch {
    return null
  }
}
