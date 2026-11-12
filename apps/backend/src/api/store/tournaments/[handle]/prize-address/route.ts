import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { PrizeAddressBodyType } from "../../../../admin/validators"
import { ticketView, TOURNAMENT_FIELDS } from "../../../../../lib/tournaments"
import { updateRegistrationResultWorkflow } from "../../../../../workflows/tournament-results"

// POST /store/tournaments/:handle/prize-address: a prize winner tells us where to send it.
// Only asked for once the result is final (the roadmap: winners only, never at sign-up).
export const POST = async (req: AuthenticatedMedusaRequest<PrizeAddressBodyType>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["*", ...TOURNAMENT_FIELDS.map((f) => `tournament.${f}`)],
    filters: { customer_id: req.auth_context.actor_id, status: "confirmed" } as never,
  })
  const r = data.find((x) => x.tournament?.handle === req.params.handle)
  if (!r?.tournament) throw new MedusaError(MedusaError.Types.NOT_FOUND, "You didn't play in this tournament.")
  if (r.prize_status !== "address" || r.review === "disqualified") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, r.prize_status === "shipped" || r.prize_status === "delivered" ? "Your prize is already on its way." : "There's no prize to send yet.")
  }
  const b = req.validatedBody
  const { result } = await updateRegistrationResultWorkflow(req.scope).run({
    input: { id: r.id, prize_address: { name: b.name, phone: b.phone, line1: b.line1, line2: b.line2 || "", city: b.city, state: b.state, pincode: b.pincode } },
  })
  res.json({ ticket: ticketView({ ...r, ...result }, r.tournament) })
}
