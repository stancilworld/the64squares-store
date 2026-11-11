import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { searchReport, periodOf } from "../../../../lib/analytics"

// GET /admin/analytics/search?days=7: Marketing → Analytics.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7
  res.json(await searchReport(req.scope, periodOf(days)))
}
