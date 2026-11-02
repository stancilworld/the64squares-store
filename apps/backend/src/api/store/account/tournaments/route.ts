import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ticketView, TOURNAMENT_FIELDS } from "../../../../lib/tournaments"

// GET /store/account/tournaments: the signed-in customer's tickets, next event first.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["*", ...TOURNAMENT_FIELDS.map((f) => `tournament.${f}`)],
    filters: { customer_id: req.auth_context.actor_id } as never,
  })
  const tickets = data
    .filter((r) => r.tournament)
    .map((r) => ticketView(r, r.tournament!))
    .sort((a, b) => new Date(b.tournament.starts_at).getTime() - new Date(a.tournament.starts_at).getTime())
  res.json({ tickets })
}
