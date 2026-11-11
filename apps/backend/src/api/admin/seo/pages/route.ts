import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadSeoPages } from "../../../../lib/seo-pages"

// GET /admin/seo/pages: every page with what Google sees and its SEO checks.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ pages: await loadSeoPages(req.scope) })
}
