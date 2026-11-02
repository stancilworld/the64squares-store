import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { TournamentRegisterBodyType } from "../../../../admin/validators"
import { sendEmail, storeUrl, tournamentTicketEmail } from "../../../../../lib/emails"
import { ticketView, TOURNAMENT_FIELDS } from "../../../../../lib/tournaments"
import { registerForTournamentWorkflow } from "../../../../../workflows/tournament"

// POST /store/tournaments/:handle/register: the signed-in customer takes a place and gets
// a ticket (emailed too). Registering again returns the same ticket.
export const POST = async (req: AuthenticatedMedusaRequest<TournamentRegisterBodyType>, res: MedusaResponse) => {
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
  const customers = req.scope.resolve(Modules.CUSTOMER)
  const me = await customers.retrieveCustomer(req.auth_context.actor_id)
  const body = req.validatedBody
  const { result } = await registerForTournamentWorkflow(req.scope).run({
    input: {
      tournament_id: t.id,
      customer_id: me.id,
      email: me.email,
      player_name: body.player_name,
      phone: body.phone ?? me.phone ?? null,
      fide_id: body.fide_id ?? null,
      rating: body.rating ?? null,
      city: body.city ?? null,
    },
  })
  const ticket = ticketView(result.registration, t)
  // Only a new (or re-opened) place gets an email; a repeat click doesn't.
  if (result.isNew) {
    await sendEmail(req.scope, me.email, "tournament-ticket", tournamentTicketEmail(ticket, `${storeUrl()}/account/tickets/${ticket.ticket_code}`))
  }
  res.json({ ticket })
}
