import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removePushSubscriptionsWorkflow } from "../../../../workflows/automations"
import type { PushUnsubscribeBodyType } from "../../../admin/validators"

// POST /store/push/unsubscribe: the browser turned notifications off.
export const POST = async (req: MedusaRequest<PushUnsubscribeBodyType>, res: MedusaResponse) => {
  await removePushSubscriptionsWorkflow(req.scope).run({ input: [req.validatedBody.endpoint] })
  res.json({ ok: true })
}
