import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { announcementLive, loadSiteFeatures } from "../../../lib/site-features"

// GET /store/site-features: the on/off switches (and words) for promotional parts of the site.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const f = await loadSiteFeatures(req.scope)
  res.set("Cache-Control", "public, max-age=30")
  res.json({ ...f, announcement: { ...f.announcement, enabled: announcementLive(f.announcement) } })
}
