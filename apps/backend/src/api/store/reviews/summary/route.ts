import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { summariesFor } from "../../../../lib/reviews"

// GET /store/reviews/summary: { [product id]: { count, average } } for the shop's product cards.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set("Cache-Control", "public, max-age=120")
  res.json({ summaries: await summariesFor(req.scope) })
}
