import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GSC_SETTING, loadGsc } from "../../../../../lib/search-console"
import { saveSettingWorkflow } from "../../../../../workflows/setting"
import type { GscSiteBodyType } from "../../../validators"

// POST /admin/seo/gsc/site { site_url }: which Search Console property to show.
export const POST = async (req: AuthenticatedMedusaRequest<GscSiteBodyType>, res: MedusaResponse) => {
  const stored = await loadGsc(req.scope)
  await saveSettingWorkflow(req.scope).run({ input: { key: GSC_SETTING, value: { ...stored, site_url: req.validatedBody.site_url } } })
  res.json({ ok: true })
}
