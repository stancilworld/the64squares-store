import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadLookups } from "../../../../lib/product-form"

// GET /admin/stancil-products/lookups: characters, collections, categories and the shared
// colour (with swatches) and material lists, for the simple product form.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await loadLookups(req.scope))
}
