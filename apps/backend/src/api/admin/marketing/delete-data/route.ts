import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteMarketingDataWorkflow } from "../../../../workflows/marketing"
import type { MarketingDeleteBodyType } from "../../validators"

// POST /admin/marketing/delete-data: removes what the Event Manager holds about one order or
// one customer (for a data deletion request). The ad platforms keep their own copies;
// those are deleted in their own tools.
export const POST = async (req: AuthenticatedMedusaRequest<MarketingDeleteBodyType>, res: MedusaResponse) => {
  const { result } = await deleteMarketingDataWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
