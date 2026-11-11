import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { articlePerformance } from "../../../../lib/content-hub"

// GET /admin/content-hub/performance?days=30: visits and Google results per article.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
  res.json(await articlePerformance(req.scope, days))
}
