import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { previewLink } from "../../../lib/preview"

// GET /admin/preview-link?path=/about → { url } that opens the website in preview mode,
// or { url: null } if preview isn't set up on this server yet.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const path = typeof req.query.path === "string" ? req.query.path : "/"
  res.json({ url: previewLink(path) })
}
