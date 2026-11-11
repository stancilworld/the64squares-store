import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendPushToAll } from "../../../../lib/push"
import type { PushSendBodyType } from "../../validators"

// POST /admin/push/send { title, body, url, image_url? }: to every browser that allowed it.
export const POST = async (req: AuthenticatedMedusaRequest<PushSendBodyType>, res: MedusaResponse) => {
  res.json({ result: await sendPushToAll(req.scope, req.validatedBody) })
}
