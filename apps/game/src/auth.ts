import { jwtVerify } from "jose"
import { config } from "./config.js"
import type { Player } from "./game.js"

const key = new TextEncoder().encode(config.playTokenSecret)

// The storefront signs { sub: customer id, name } for 12 hours when a signed-in player
// opens a game page. Nothing else about the customer reaches the game server.
// Guests get { sub: "guest_…", name: "Guest1234", guest: true }: casual games only.
export const playerFromToken = async (token: unknown): Promise<Player | null> => {
  if (typeof token !== "string" || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: "the64squares-play" })
    const sub = payload.sub
    const guest = typeof sub === "string" && /^guest_[A-Za-z0-9]{8,32}$/.test(sub) && payload.guest === true
    if (typeof sub !== "string" || (!sub.startsWith("cus_") && !guest)) return null
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 60) : "Player"
    return { id: sub, name }
  } catch {
    return null
  }
}
