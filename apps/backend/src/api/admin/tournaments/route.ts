import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { countConfirmed, FORMAT_LABELS, TOURNAMENT_FIELDS } from "../../../lib/tournaments"
import { createTournamentWorkflow } from "../../../workflows/tournament"
import type { TournamentBodyType } from "../validators"

// GET /admin/tournaments: every tournament with its number of players, newest start first.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "tournament", fields: TOURNAMENT_FIELDS })
  const counts = await countConfirmed(req.scope, data.map((t) => t.id))
  const tournaments = data
    .map((t) => ({ ...t, format_label: FORMAT_LABELS[t.format] ?? t.format, registered: counts.get(t.id) ?? 0 }))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  res.json({ tournaments })
}

export const POST = async (req: AuthenticatedMedusaRequest<TournamentBodyType>, res: MedusaResponse) => {
  const { result } = await createTournamentWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ tournament: result })
}
