import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { loadAutomations } from "../../../../lib/automations"
import { sampleMail } from "../../../../lib/automations-run"
import { sendEmail } from "../../../../lib/emails"
import type { AutomationTestBodyType } from "../../validators"

// POST /admin/automations/test { kind, to }: a sample of one automatic email (as saved).
export const POST = async (req: AuthenticatedMedusaRequest<AutomationTestBodyType>, res: MedusaResponse) => {
  const a = await loadAutomations(req.scope)
  const ok = await sendEmail(req.scope, req.validatedBody.to, `auto-test-${req.validatedBody.kind}`, sampleMail(req.validatedBody.kind, a[req.validatedBody.kind], req.validatedBody.to))
  if (!ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "The email couldn't be sent. Check the email connection in Settings → Email.")
  res.json({ ok: true })
}
