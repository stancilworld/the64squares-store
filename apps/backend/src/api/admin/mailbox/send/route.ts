import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { explainMailError, sendMail } from "../../../../lib/mailbox"
import type { MailSendBodyType } from "../../validators"

// POST /admin/mailbox/send: a new email or a reply, from the shop's mailbox.
export const POST = async (req: AuthenticatedMedusaRequest<MailSendBodyType>, res: MedusaResponse) => {
  let by: string | null = null
  try {
    const u = await req.scope.resolve(Modules.USER).retrieveUser(req.auth_context.actor_id)
    by = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email
  } catch {
    // fine
  }
  try {
    const message = await sendMail(req.scope, { ...req.validatedBody, sent_by: by })
    res.json({ ok: true, message })
  } catch (e) {
    res.status(400).json({ ok: false, message: (e as Error).message?.startsWith("The mailbox") ? (e as Error).message : explainMailError(e) })
  }
}
