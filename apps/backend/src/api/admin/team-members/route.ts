import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createTeamMemberWorkflow } from "../../../workflows/team-member"
import type { TeamMemberBodyType } from "../validators"

// GET /admin/team-members: every face in "Meet our team", in display order.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "team_member", fields: ["*"] })
  data.sort((a, b) => a.rank - b.rank)
  res.json({ team_members: data })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<TeamMemberBodyType>,
  res: MedusaResponse
) => {
  const { result } = await createTeamMemberWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ team_member: result })
}
