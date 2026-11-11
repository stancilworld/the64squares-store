import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SEO_MODULE } from "../../../../modules/seo"
import type SeoModuleService from "../../../../modules/seo/service"
import { clearNotFoundWorkflow } from "../../../../workflows/seo"
import type { ClearNotFoundBodyType } from "../../validators"

// GET /admin/seo/not-found: addresses visitors tried that don't exist, most-hit first.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const seo: SeoModuleService = req.scope.resolve(SEO_MODULE)
  const rows = await seo.listNotFounds({}, { take: 500, order: { hits: "DESC" } })
  res.json({ not_found: rows })
}

// POST /admin/seo/not-found { ids }: clears them from the list.
export const POST = async (req: AuthenticatedMedusaRequest<ClearNotFoundBodyType>, res: MedusaResponse) => {
  await clearNotFoundWorkflow(req.scope).run({ input: req.validatedBody.ids })
  res.json({ ok: true })
}
