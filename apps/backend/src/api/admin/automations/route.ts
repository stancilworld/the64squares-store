import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AUTOMATIONS_KEY, loadAutomations, resolveAutomations } from "../../../lib/automations"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { AutomationsBodyType } from "../validators"

// GET /admin/automations
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ automations: await loadAutomations(req.scope) })
}

// POST /admin/automations: the emails sent are merged into what's saved.
export const POST = async (req: AuthenticatedMedusaRequest<AutomationsBodyType>, res: MedusaResponse) => {
  const current = (await loadAutomations(req.scope)) as unknown as Record<string, Record<string, unknown>>
  const merged: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(req.validatedBody)) if (v) merged[k] = { ...current[k], ...v }
  const { result } = await saveSettingWorkflow(req.scope).run({ input: { key: AUTOMATIONS_KEY, value: merged } })
  res.json({ automations: resolveAutomations(result.value) })
}
