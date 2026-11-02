import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { normaliseTicketCode, ticketView, TOURNAMENT_FIELDS } from "../../../lib/tournaments"
import { checkInPlayerWorkflow } from "../../../workflows/tournament"
import type { CheckInBodyType } from "../validators"

const findTicket = async (req: AuthenticatedMedusaRequest, raw: string) => {
  const code = normaliseTicketCode(raw)
  if (!code) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "That doesn't look like a ticket code (T64- and 6 letters or numbers).")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["*", ...TOURNAMENT_FIELDS.map((f) => `tournament.${f}`)],
    filters: { ticket_code: code } as never,
  })
  if (!data[0]?.tournament) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No ticket ${code}.`)
  }
  return data[0]
}

// GET /admin/tournament-checkin?code=T64-XXXXXX: look a ticket up (from the QR code).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const r = await findTicket(req, String(req.query.code ?? ""))
  res.json({ ticket: ticketView(r, r.tournament!) })
}

// POST /admin/tournament-checkin { code, undo? }: mark the player as arrived (or undo).
export const POST = async (req: AuthenticatedMedusaRequest<CheckInBodyType>, res: MedusaResponse) => {
  const r = await findTicket(req, req.validatedBody.code)
  const { result } = await checkInPlayerWorkflow(req.scope).run({ input: { id: r.id, undo: req.validatedBody.undo } })
  res.json({ ticket: ticketView({ ...r, ...result }, r.tournament!) })
}
