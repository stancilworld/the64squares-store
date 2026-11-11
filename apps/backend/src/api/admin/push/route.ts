import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AUTOMATION_MODULE } from "../../../modules/automation"
import type AutomationModuleService from "../../../modules/automation/service"

// GET /admin/push: how many browsers get notifications, and the latest ones sent.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s: AutomationModuleService = req.scope.resolve(AUTOMATION_MODULE)
  const [[, subscribers], sends] = await Promise.all([s.listAndCountPushSubscriptions({}, { take: 1 }), s.listPushSends({}, { order: { created_at: "DESC" }, take: 20 })])
  res.json({ subscribers, sends })
}
