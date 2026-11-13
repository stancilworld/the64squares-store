import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { orderShowcaseAdsWorkflow } from "../../../../workflows/showcase"

// POST /admin/showcase/order { ids }: the order adverts take turns in, first to last.
export const POST = async (req: AuthenticatedMedusaRequest<{ ids: string[] }>, res: MedusaResponse) => {
  await orderShowcaseAdsWorkflow(req.scope).run({ input: req.validatedBody.ids })
  res.json({ ok: true })
}
