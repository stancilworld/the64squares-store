import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ideaSources } from "../../../../lib/content-hub"

// GET /admin/content-hub/idea-sources: what people search for (shop and Google).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await ideaSources(req.scope))
}
