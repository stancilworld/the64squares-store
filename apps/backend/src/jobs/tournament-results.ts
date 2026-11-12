import type { MedusaContainer } from "@medusajs/framework/types"
import { processTournamentResults } from "../lib/tournament-results"

// Every 2 minutes: results for online tournaments that ended (placings, certificates,
// passes, the fair-play review), events called off for too few players, and final results.
export default async function tournamentResults(container: MedusaContainer) {
  const logger = container.resolve("logger") as { info: (m: string) => void }
  const r = await processTournamentResults(container)
  if (r.recorded || r.cancelled || r.finalized) logger.info(`Tournament results: ${r.recorded} recorded, ${r.cancelled} called off, ${r.finalized} made final`)
}

export const config = { name: "tournament-results", schedule: "*/2 * * * *" }
