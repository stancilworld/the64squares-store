import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { orderShowcaseAdsWorkflow } from "../../../../workflows/showcase"
import { refreshWebsite } from "../../../../lib/website-cache"

// POST /admin/showcase/order { ids }: the order adverts take turns in, first to last.
export const POST = async (req: AuthenticatedMedusaRequest<{ ids: string[] }>, res: MedusaResponse) => {
  await orderShowcaseAdsWorkflow(req.scope).run({ input: req.validatedBody.ids })
  await refreshWebsite(["showcase"])
  res.json({ ok: true })
}
