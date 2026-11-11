import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { playReport, periodOf } from "../../../../lib/analytics"

// GET /admin/analytics/play?days=7: Marketing → Analytics.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7
  res.json(await playReport(req.scope, periodOf(days)))
}
