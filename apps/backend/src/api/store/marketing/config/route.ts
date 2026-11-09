import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { secretsOf } from "../../../../lib/marketing/engine"
import { type Integration, isLive, loadMarketingSettings } from "../../../../lib/marketing/settings"

// GET /store/marketing/config: which tags the website loads, and the cookie banner.
// Only public ids, never a secret key. With ?check=<code> (a test started in the admin),
// the ids being tested are included even before they're switched on.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const s = await loadMarketingSettings(req.scope)
  const secrets = await secretsOf(req.scope)
  const live = (i: Integration) => isLive(s, i, secrets)
  const check = typeof req.query.check === "string" ? req.query.check : null
  const testing = check
    ? (Object.entries(s.pending_checks) as [Integration, { nonce: string; at: string }][])
        .filter(([, p]) => p.nonce === check && Date.now() - new Date(p.at).getTime() < 10 * 60_000)
        .map(([i]) => i)
    : []
  const on = (i: Integration) => live(i) || testing.includes(i)
  res.set("Cache-Control", check ? "no-store" : "public, max-age=60")
  res.json({
    consent: s.consent,
    content_id: s.content_id,
    meta_pixel: on("meta_pixel") ? { pixel_id: s.meta_pixel.pixel_id } : null,
    ga4: on("ga4") ? { measurement_id: s.ga4.measurement_id, purchase_from_server: live("ga4") && s.ga4.server_enabled } : null,
    google_ads: on("google_ads")
      ? {
          conversion_id: s.google_ads.conversion_id,
          purchase_label: s.google_ads.purchase_label || null,
          lead_label: s.google_ads.lead_label || null,
          enhanced_conversions: s.google_ads.enhanced_conversions,
        }
      : null,
    gtm: on("gtm") ? { container_id: s.gtm.container_id } : null,
    clarity: on("clarity") ? { project_id: s.clarity.project_id } : null,
    excluded: s.excluded,
    check: testing.length ? { nonce: check, integrations: testing } : null,
  })
}
