import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { approvedFor } from "../../../lib/reviews"

// GET /store/reviews?product_id=…: a product's approved reviews and its star summary.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = typeof req.query.product_id === "string" ? req.query.product_id : ""
  if (!/^prod_[A-Za-z0-9]{6,40}$/.test(id)) return res.status(400).json({ message: "product_id is required" })
  res.set("Cache-Control", "public, max-age=60")
  res.json(await approvedFor(req.scope, id))
}
