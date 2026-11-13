import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { claimShowcaseWorkflow } from "../../../../../workflows/showcase"

// POST /store/showcase/:id/claim: a signed-in player claims an advert's reward or coupon.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await claimShowcaseWorkflow(req.scope).run({ input: { ad_id: req.params.id, customer_id: req.auth_context.actor_id } })
  res.json(result)
}
