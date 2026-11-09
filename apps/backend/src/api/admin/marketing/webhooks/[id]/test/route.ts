import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { marketingView, testWebhook } from "../../../../../../lib/marketing/admin-view"

// POST /admin/marketing/webhooks/:id/test: sends a signed test call.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const result = await testWebhook(req.scope, req.params.id)
  res.json({ result, ...(await marketingView(req.scope)) })
}
