import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { TournamentRegisterBodyType } from "../../../../admin/validators"
import { sendEmail, storeUrl, tournamentTicketEmail } from "../../../../../lib/emails"
import { playRating } from "../../../../../lib/play-ratings"
import { ageOn, loadPlayer } from "../../../../../lib/player-profile"
import { speedOfTc, ticketView, TOURNAMENT_FIELDS } from "../../../../../lib/tournaments"
import { registerForTournamentWorkflow } from "../../../../../workflows/tournament"

// POST /store/tournaments/:handle/register: the signed-in customer takes a place and gets
// a ticket (emailed too). Online tournaments use the player's profile ("Almost done" first),
// their online rating, and one Tournament Pass. Registering again returns the same ticket.
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
  const body = req.validatedBody
  let input
  if (t.mode === "online") {
    const { customer: me, player, missing } = await loadPlayer(req.scope, req.auth_context.actor_id)
    if (missing.length) {
      return res.status(409).json({ type: "profile_needed", message: "Please complete your player profile first.", missing })
    }
    const rated = await playRating(req.scope, me.id, speedOfTc(t.time_control))
    input = {
      tournament_id: t.id,
      customer_id: me.id,
      email: me.email,
      player_name: `${me.first_name} ${me.last_name}`.trim(),
      phone: me.phone ?? null,
      fide_id: body.fide_id ?? null,
      rating: rated.rating,
      city: player.city,
      age: ageOn(player.dob, new Date(t.starts_at as unknown as string)),
      source: body.source ?? null,
    }
  } else {
    const me = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
    if (!body.player_name) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please enter the player's name.")
    input = {
      tournament_id: t.id,
      customer_id: me.id,
      email: me.email,
      player_name: body.player_name,
      phone: body.phone ?? me.phone ?? null,
      fide_id: body.fide_id ?? null,
      rating: body.rating ?? null,
      city: body.city ?? null,
      source: body.source ?? null,
    }
  }
  const { result } = await registerForTournamentWorkflow(req.scope).run({ input })
  const ticket = ticketView(result.registration, t)
  // Only a new (or re-opened) place gets an email; a repeat click doesn't.
  if (result.isNew) {
    await sendEmail(req.scope, input.email, "tournament-ticket", tournamentTicketEmail(ticket, `${storeUrl()}/account/tickets/${ticket.ticket_code}`))
  }
  res.json({ ticket })
}
