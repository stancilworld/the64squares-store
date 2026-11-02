import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadMyTicket, ticketView } from "../../../../../lib/tournaments"

// GET /store/account/tournaments/:code: one of the customer's own tickets.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const r = await loadMyTicket(req)
  res.json({ ticket: ticketView(r, r.tournament!) })
}
