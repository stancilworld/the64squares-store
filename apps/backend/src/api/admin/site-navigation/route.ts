import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DEFAULT_SITE_NAVIGATION, SITE_NAVIGATION_KEY, loadSiteNavigation } from "../../../lib/site-navigation"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { SiteNavigationBodyType } from "../validators"

// GET /admin/site-navigation: the saved menu, footer and announcement (and the defaults).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ navigation: await loadSiteNavigation(req.scope), defaults: DEFAULT_SITE_NAVIGATION })
}

// POST /admin/site-navigation: save all of it (the editor always sends everything).
export const POST = async (req: AuthenticatedMedusaRequest<SiteNavigationBodyType>, res: MedusaResponse) => {
  await saveSettingWorkflow(req.scope).run({
    input: { key: SITE_NAVIGATION_KEY, value: req.validatedBody as unknown as Record<string, unknown> },
  })
  res.json({ navigation: await loadSiteNavigation(req.scope), defaults: DEFAULT_SITE_NAVIGATION })
}
