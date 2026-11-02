import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { TOURNAMENT_FIELDS } from "../../../../lib/tournaments"
import { deleteTournamentWorkflow, updateTournamentWorkflow } from "../../../../workflows/tournament"
import type { UpdateTournamentBodyType } from "../../validators"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "tournament", fields: TOURNAMENT_FIELDS, filters: { id: req.params.id } })
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Tournament not found")
  }
  res.json({ tournament: data[0] })
}

export const POST = async (req: AuthenticatedMedusaRequest<UpdateTournamentBodyType>, res: MedusaResponse) => {
  const { result } = await updateTournamentWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ tournament: result })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteTournamentWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "tournament", deleted: true })
}
