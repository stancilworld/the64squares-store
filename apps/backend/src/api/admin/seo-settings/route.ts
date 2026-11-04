import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SEO_SETTINGS_KEY, loadSeoSettings, resolveSeoSettings } from "../../../lib/seo-settings"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { SeoSettingsBodyType } from "../validators"

// GET /admin/seo-settings
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ settings: await loadSeoSettings(req.scope) })
}

// POST /admin/seo-settings
export const POST = async (req: AuthenticatedMedusaRequest<SeoSettingsBodyType>, res: MedusaResponse) => {
  const value = { ...(await loadSeoSettings(req.scope)), ...req.validatedBody }
  const { result } = await saveSettingWorkflow(req.scope).run({ input: { key: SEO_SETTINGS_KEY, value } })
  res.json({ settings: resolveSeoSettings(result.value) })
}
