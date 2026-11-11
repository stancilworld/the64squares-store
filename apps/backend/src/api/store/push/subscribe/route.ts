import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { loadSiteFeatures } from "../../../../lib/site-features"
import { savePushSubscriptionWorkflow } from "../../../../workflows/automations"
import type { PushSubscribeBodyType } from "../../../admin/validators"

// POST /store/push/subscribe: a browser that allowed notifications.
export const POST = async (req: MedusaRequest<PushSubscribeBodyType>, res: MedusaResponse) => {
  if (!(await loadSiteFeatures(req.scope)).push.enabled) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Notifications are off")
  const { endpoint, keys } = req.validatedBody
  await savePushSubscriptionWorkflow(req.scope).run({ input: { endpoint, p256dh: keys.p256dh, auth: keys.auth } })
  res.json({ ok: true })
}
