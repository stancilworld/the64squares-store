import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { dispatchSoon } from "../../../../lib/marketing/engine"
import { retryMarketingDeliveriesWorkflow } from "../../../../workflows/marketing"
import type { MarketingRetryBodyType } from "../../validators"

// POST /admin/marketing/retry: sends failed deliveries again, now.
export const POST = async (req: AuthenticatedMedusaRequest<MarketingRetryBodyType>, res: MedusaResponse) => {
  const { result } = await retryMarketingDeliveriesWorkflow(req.scope).run({ input: req.validatedBody })
  dispatchSoon(req.scope, result.ids)
  res.json({ queued: result.ids.length })
}
