import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { engineState } from "../../../../../lib/tournament-admin"

// GET /admin/tournaments/:id/engine: the live state, entrants and every game (online events).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await engineState(req.scope, req.params.id))
}
