import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { marketingView } from "../../../lib/marketing/admin-view"
import { secretsOf } from "../../../lib/marketing/engine"
import {
  INTEGRATIONS,
  MARKETING_SETTINGS_KEY,
  type MarketingSettings,
  fingerprintOf,
  loadMarketingSettings,
} from "../../../lib/marketing/settings"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { MarketingSettingsBodyType } from "../validators"

// GET /admin/marketing: settings, each integration's state, warnings.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await marketingView(req.scope))
}

// POST /admin/marketing: change settings. An integration can only be switched on once its
// test has passed with the ids it has now.
export const POST = async (req: AuthenticatedMedusaRequest<MarketingSettingsBodyType>, res: MedusaResponse) => {
  const body = req.validatedBody
  const s = await loadMarketingSettings(req.scope)
  const next: MarketingSettings = {
    ...s,
    consent: { ...s.consent, ...(body.consent ?? {}) },
    meta_pixel: { ...s.meta_pixel, ...(body.meta_pixel ?? {}) },
    meta_capi: { ...s.meta_capi, ...(body.meta_capi ?? {}) },
    ga4: { ...s.ga4, ...(body.ga4 ?? {}) },
    google_ads: { ...s.google_ads, ...(body.google_ads ?? {}) },
    gtm: { ...s.gtm, ...(body.gtm ?? {}) },
    clarity: { ...s.clarity, ...(body.clarity ?? {}) },
    content_id: body.content_id ?? s.content_id,
    excluded: body.excluded ?? s.excluded,
    retention_days: body.retention_days ?? s.retention_days,
  }
  if (next.consent.text !== undefined && !next.consent.text.trim()) next.consent.text = s.consent.text
  const secrets = await secretsOf(req.scope)
  for (const i of INTEGRATIONS) {
    const turningOn = next[i].enabled && !s[i].enabled
    if (!turningOn) continue
    const check = next.checks[i]
    if (!check || !check.ok || check.fingerprint !== fingerprintOf(next, i, secrets)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Run the test first: an integration can only be switched on once its test has passed.")
    }
  }
  await saveSettingWorkflow(req.scope).run({ input: { key: MARKETING_SETTINGS_KEY, value: next as unknown as Record<string, unknown> } })
  res.json(await marketingView(req.scope))
}
