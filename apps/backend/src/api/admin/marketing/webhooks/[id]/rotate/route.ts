import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { marketingView } from "../../../../../../lib/marketing/admin-view"
import { rotateWebhookSecret } from "../../../../../../lib/marketing/webhooks"

// POST /admin/marketing/webhooks/:id/rotate: a new signing secret (shown once); the old one stops working.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const secret = await rotateWebhookSecret(req.scope, req.params.id)
  if (!secret) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Webhook not found.")
  res.json({ secret, ...(await marketingView(req.scope)) })
}
