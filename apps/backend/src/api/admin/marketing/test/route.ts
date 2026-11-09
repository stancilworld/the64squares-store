import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { marketingView, runTest } from "../../../../lib/marketing/admin-view"
import type { MarketingTestBodyType } from "../../validators"

// POST /admin/marketing/test: tests one integration (see runTest).
export const POST = async (req: AuthenticatedMedusaRequest<MarketingTestBodyType>, res: MedusaResponse) => {
  const result = await runTest(req.scope, req.validatedBody.integration)
  res.json({ result, ...(await marketingView(req.scope)) })
}
