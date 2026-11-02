import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setRegistrationStatusWorkflow } from "../../../../../../workflows/tournament"
import type { RegistrationStatusBodyType } from "../../../../validators"

// POST /admin/tournaments/:id/registrations/:rid: staff cancel or restore a player's place.
export const POST = async (req: AuthenticatedMedusaRequest<RegistrationStatusBodyType>, res: MedusaResponse) => {
  const { result } = await setRegistrationStatusWorkflow(req.scope).run({
    input: { id: req.params.rid, status: req.validatedBody.status, by: "staff" },
  })
  res.json({ registration: result })
}
