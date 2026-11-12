import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { checkInOpen, checkInWindow, formatWhen, ticketView, TOURNAMENT_FIELDS } from "../../../../../lib/tournaments"
import { checkInPlayerWorkflow } from "../../../../../workflows/tournament"

// POST /store/tournaments/:handle/check-in: "I'm here" in the check-in window before an online
// tournament. Players who don't check in aren't paired.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["*", ...TOURNAMENT_FIELDS.map((f) => `tournament.${f}`)],
    filters: { customer_id: req.auth_context.actor_id, status: "confirmed" } as never,
  })
  const r = data.find((x) => x.tournament?.handle === req.params.handle)
  if (!r?.tournament) throw new MedusaError(MedusaError.Types.NOT_FOUND, "You're not registered for this tournament.")
  const t = r.tournament
  if (!checkInOpen(t)) {
    const w = checkInWindow(t)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      !w ? "This tournament has no check-in." : Date.now() < new Date(w.opens).getTime() ? `Check-in opens ${formatWhen(w.opens)}.` : "Check-in has closed."
    )
  }
  const { result } = await checkInPlayerWorkflow(req.scope).run({ input: { id: r.id } })
  res.json({ ticket: ticketView({ ...r, ...result }, t) })
}
