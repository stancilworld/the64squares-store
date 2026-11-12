import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateRegistrationResultWorkflow } from "../../../../../../../workflows/tournament-results"
import type { RegistrationResultBodyType } from "../../../../../validators"

// POST /admin/tournaments/:id/registrations/:rid/result: the fair-play review of a finisher
// (cleared or disqualified), or a prize's delivery (shipped with tracking, delivered).
export const POST = async (req: AuthenticatedMedusaRequest<RegistrationResultBodyType>, res: MedusaResponse) => {
  const { result } = await updateRegistrationResultWorkflow(req.scope).run({ input: { id: req.params.rid, ...req.validatedBody } })
  res.json({ registration: result })
}
