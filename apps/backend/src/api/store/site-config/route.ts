import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadSeoSettings } from "../../../lib/seo-settings"

// GET /store/site-config: analytics ids and search-engine settings the website puts in every page.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const s = await loadSeoSettings(req.scope)
  res.set("Cache-Control", "public, max-age=60")
  res.json(s)
}
