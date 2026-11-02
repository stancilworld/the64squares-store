import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { countConfirmed, publicTournament, TOURNAMENT_FIELDS } from "../../../../lib/tournaments"

// GET /store/tournaments/:handle
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament",
    fields: TOURNAMENT_FIELDS,
    filters: { handle: req.params.handle, status: ["published", "cancelled", "completed"] } as never,
  })
  const t = data[0]
  if (!t) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Tournament not found")
  }
  const counts = await countConfirmed(req.scope, [t.id])
  res.set("Cache-Control", "no-store")
  res.json({ tournament: publicTournament(t, counts.get(t.id) ?? 0) })
}
