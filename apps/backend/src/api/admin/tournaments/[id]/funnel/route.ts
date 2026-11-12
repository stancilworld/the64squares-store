import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { tournamentFunnel } from "../../../../../lib/tournament-admin"

// GET /admin/tournaments/:id/funnel: visits → registered → joined → played, by source.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await tournamentFunnel(req.scope, req.params.id))
}
