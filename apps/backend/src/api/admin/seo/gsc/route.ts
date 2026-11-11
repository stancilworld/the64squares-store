import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callbackUrl, loadGsc, sitesFor } from "../../../../lib/search-console"
import { getServiceKeys } from "../../../../lib/service-keys"

// GET /admin/seo/gsc: is Search Console connected, to which site, and which sites can be chosen.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const [stored, keys] = await Promise.all([loadGsc(req.scope), getServiceKeys(req.scope)])
  let sites: string[] = []
  let error: string | null = null
  if (stored.refresh_enc) {
    try {
      sites = await sitesFor(req.scope, stored)
    } catch (e) {
      error = (e as Error).message
    }
  }
  res.json({
    google_keys: !!keys.google,
    callback_url: callbackUrl(),
    connected: !!stored.refresh_enc,
    email: stored.email,
    site_url: stored.site_url,
    connected_at: stored.connected_at,
    sites,
    error,
  })
}
