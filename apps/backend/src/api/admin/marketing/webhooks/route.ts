import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { marketingView } from "../../../../lib/marketing/admin-view"
import { createWebhook } from "../../../../lib/marketing/webhooks"
import type { WebhookBodyType } from "../../validators"

// POST /admin/marketing/webhooks: adds an endpoint. The signing secret is in this answer only.
export const POST = async (req: AuthenticatedMedusaRequest<WebhookBodyType>, res: MedusaResponse) => {
  try {
    const { id, secret } = await createWebhook(req.scope, req.validatedBody)
    res.json({ id, secret, ...(await marketingView(req.scope)) })
  } catch (e) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, (e as Error).message)
  }
}
