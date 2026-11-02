import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadMyTicket, ticketView } from "../../../../../../lib/tournaments"
import { setRegistrationStatusWorkflow } from "../../../../../../workflows/tournament"

// POST /store/account/tournaments/:code/cancel: give up a place before the event starts.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const r = await loadMyTicket(req)
  const { result } = await setRegistrationStatusWorkflow(req.scope).run({
    input: { id: r.id, status: "cancelled", by: "player" },
  })
  res.json({ ticket: ticketView({ ...r, ...result }, r.tournament!) })
}
