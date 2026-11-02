import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadContactPage, publicContactPage } from "../../../lib/contact-page"

// GET /store/contact-page: the Contact page's panel and form, as set in the admin.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ contact: publicContactPage(await loadContactPage(req.scope)) })
}
