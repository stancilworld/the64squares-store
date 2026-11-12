import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { nudgeGameServer } from "../../../../../../lib/tournament-admin"
import { setRegistrationStatusWorkflow } from "../../../../../../workflows/tournament"
import type { RegistrationStatusBodyType } from "../../../../validators"

// POST /admin/tournaments/:id/registrations/:rid: staff cancel or restore a player's place,
// or remove a player from a tournament in progress ("withdrawn": they lose their games left).
export const POST = async (req: AuthenticatedMedusaRequest<RegistrationStatusBodyType>, res: MedusaResponse) => {
  const { result } = await setRegistrationStatusWorkflow(req.scope).run({
    input: { id: req.params.rid, status: req.validatedBody.status, by: "staff" },
  })
  await nudgeGameServer(req.scope, req.params.id)
  res.json({ registration: result })
}
