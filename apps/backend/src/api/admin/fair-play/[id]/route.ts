import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { decide, flagDetail } from "../../../../lib/fairplay"
import type { FairPlayDecisionBodyType } from "../../validators"

const idOf = (req: AuthenticatedMedusaRequest) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found")
  return id
}

// GET /admin/fair-play/:id: the flag, with the checked games behind it.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const detail = await flagDetail(req.scope, idOf(req))
  if (!detail) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found")
  res.json(detail)
}

// POST /admin/fair-play/:id { action: clear | warn | ban | unban, scope?, note? }
export const POST = async (req: AuthenticatedMedusaRequest<FairPlayDecisionBodyType>, res: MedusaResponse) => {
  const out = await decide(req.scope, idOf(req), req.validatedBody, req.auth_context?.actor_id ?? null)
  if (!out) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found")
  res.json(out)
}
