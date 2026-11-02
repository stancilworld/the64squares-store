import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  deleteTeamMemberWorkflow,
  updateTeamMemberWorkflow,
} from "../../../../workflows/team-member"
import type { UpdateTeamMemberBodyType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateTeamMemberBodyType>,
  res: MedusaResponse
) => {
  const { result } = await updateTeamMemberWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ team_member: result })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteTeamMemberWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "team_member", deleted: true })
}
