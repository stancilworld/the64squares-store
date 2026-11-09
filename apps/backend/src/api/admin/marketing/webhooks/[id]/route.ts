import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { marketingView } from "../../../../../lib/marketing/admin-view"
import { deleteWebhook, updateWebhook } from "../../../../../lib/marketing/webhooks"
import type { WebhookUpdateBodyType } from "../../../validators"

// POST /admin/marketing/webhooks/:id: change the address, events or switch it on/off.
export const POST = async (req: AuthenticatedMedusaRequest<WebhookUpdateBodyType>, res: MedusaResponse) => {
  if (!(await updateWebhook(req.scope, req.params.id, req.validatedBody))) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Webhook not found.")
  res.json(await marketingView(req.scope))
}

// DELETE /admin/marketing/webhooks/:id
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteWebhook(req.scope, req.params.id)
  res.json(await marketingView(req.scope))
}
