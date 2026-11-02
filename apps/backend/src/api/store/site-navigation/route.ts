import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadSiteNavigation } from "../../../lib/site-navigation"

// GET /store/site-navigation: top menu, footer and announcement bar for the website.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set("Cache-Control", "public, max-age=30")
  res.json({ navigation: await loadSiteNavigation(req.scope) })
}
