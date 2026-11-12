import type { MedusaContainer } from "@medusajs/framework/types"
import { awardEarnedPasses } from "../lib/pass-earning"

// Every 30 minutes: Tournament Passes earned by playing (welcome, rated games, puzzle streaks).
export default async function tournamentPasses(container: MedusaContainer) {
  await awardEarnedPasses(container)
}

export const config = { name: "tournament-passes", schedule: "*/30 * * * *" }
