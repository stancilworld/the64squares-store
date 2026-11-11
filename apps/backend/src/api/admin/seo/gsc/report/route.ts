import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { loadGsc, report } from "../../../../../lib/search-console"

// GET /admin/seo/gsc/report?days=28: clicks, impressions, top searches and pages from Google.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const days = [7, 28, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 28
  try {
    res.json(await report(req.scope, await loadGsc(req.scope), days))
  } catch (e) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, (e as Error).message)
  }
}
