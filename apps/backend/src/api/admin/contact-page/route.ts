import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTACT_PAGE_KEY, DEFAULT_CONTACT_PAGE, loadContactPage } from "../../../lib/contact-page"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { ContactPageBodyType } from "../validators"

// GET /admin/contact-page: the saved Contact page (and the defaults).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ contact: await loadContactPage(req.scope), defaults: DEFAULT_CONTACT_PAGE })
}

// POST /admin/contact-page: save all of it (the editor always sends everything).
export const POST = async (req: AuthenticatedMedusaRequest<ContactPageBodyType>, res: MedusaResponse) => {
  await saveSettingWorkflow(req.scope).run({
    input: { key: CONTACT_PAGE_KEY, value: req.validatedBody as unknown as Record<string, unknown> },
  })
  res.json({ contact: await loadContactPage(req.scope), defaults: DEFAULT_CONTACT_PAGE })
}
