import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SITE_FEATURES_KEY, loadSiteFeatures, resolveSiteFeatures } from "../../../lib/site-features"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { SiteFeaturesBodyType } from "../validators"

// GET /admin/site-features
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ features: await loadSiteFeatures(req.scope) })
}

// POST /admin/site-features: any sections sent are merged into what's saved.
export const POST = async (req: AuthenticatedMedusaRequest<SiteFeaturesBodyType>, res: MedusaResponse) => {
  const current = await loadSiteFeatures(req.scope)
  const merged: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(req.validatedBody)) {
    if (v) merged[k] = { ...(current as Record<string, Record<string, unknown>>)[k], ...v }
  }
  const { result } = await saveSettingWorkflow(req.scope).run({ input: { key: SITE_FEATURES_KEY, value: merged } })
  res.json({ features: resolveSiteFeatures(result.value) })
}
