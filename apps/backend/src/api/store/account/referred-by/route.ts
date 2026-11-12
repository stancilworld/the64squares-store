import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AUTOMATION_MODULE } from "../../../../modules/automation"
import type AutomationModuleService from "../../../../modules/automation/service"
import { setReferredByWorkflow } from "../../../../workflows/player-profile"

// POST /store/account/referred-by { code }: the invite code a new player arrived with
// (?code= on a friend's link). Unknown codes and older accounts are quietly ignored.
export const POST = async (req: AuthenticatedMedusaRequest<{ code?: unknown }>, res: MedusaResponse) => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : ""
  if (!/^[\w-]{2,60}$/.test(code)) return res.json({ saved: false })
  const auto: AutomationModuleService = req.scope.resolve(AUTOMATION_MODULE)
  const [ref] = await auto.listReferrals({ code: code.toUpperCase() }, { take: 1 })
  const [exact] = ref ? [ref] : await auto.listReferrals({ code }, { take: 1 })
  if (!exact) return res.json({ saved: false })
  const { result } = await setReferredByWorkflow(req.scope).run({ input: { customer_id: req.auth_context.actor_id, inviter_id: exact.customer_id } })
  res.json(result)
}
