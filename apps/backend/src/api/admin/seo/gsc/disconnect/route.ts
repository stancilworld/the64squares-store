import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GSC_SETTING } from "../../../../../lib/search-console"
import { saveSettingWorkflow } from "../../../../../workflows/setting"

// POST /admin/seo/gsc/disconnect: forgets the access Google gave.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await saveSettingWorkflow(req.scope).run({ input: { key: GSC_SETTING, value: { refresh_enc: null, site_url: null, email: null, connected_at: null } } })
  res.json({ ok: true })
}
