import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { unsubscribeOk } from "../../../lib/automations"
import { emailOptOutWorkflow } from "../../../workflows/automations"
import type { UnsubscribeBodyType } from "../../admin/validators"

// POST /store/unsubscribe { email, sig }: the "Stop these emails" link in automatic emails.
export const POST = async (req: MedusaRequest<UnsubscribeBodyType>, res: MedusaResponse) => {
  const { email, sig } = req.validatedBody
  if (!unsubscribeOk(email, sig)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This link isn't valid. Please use the link in the email.")
  await emailOptOutWorkflow(req.scope).run({ input: email })
  res.json({ ok: true })
}
