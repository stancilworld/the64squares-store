import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { TournamentVisitBodyType } from "../../../../admin/validators"
import { recordTournamentVisitWorkflow } from "../../../../../workflows/tournament"

// POST /store/tournaments/:handle/visit: a visitor opened the tournament page (counted once
// per visitor; no personal data, just a random id kept in the browser and where they came from).
export const POST = async (req: MedusaRequest<TournamentVisitBodyType>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "tournament", fields: ["id"], filters: { handle: req.params.handle } as never })
  if (!data[0]) return res.status(404).json({ ok: false })
  const source = (req.validatedBody.source || "direct").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60) || "direct"
  try {
    await recordTournamentVisitWorkflow(req.scope).run({ input: { tournament_id: data[0].id, visitor: req.validatedBody.visitor, source } })
  } catch {
    // Two tabs at once: the unique index keeps one.
  }
  res.json({ ok: true })
}
