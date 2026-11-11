import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SEO_MODULE } from "../../../../modules/seo"
import type SeoModuleService from "../../../../modules/seo/service"
import { saveRedirectWorkflow } from "../../../../workflows/seo"
import type { RedirectBodyType } from "../../validators"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const seo: SeoModuleService = req.scope.resolve(SEO_MODULE)
  const redirects = await seo.listRedirects({}, { take: 2000, order: { created_at: "DESC" } })
  res.json({ redirects })
}

export const POST = async (req: AuthenticatedMedusaRequest<RedirectBodyType>, res: MedusaResponse) => {
  const { result } = await saveRedirectWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ redirect: result })
}
