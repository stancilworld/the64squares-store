import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { changePairings, nudgeGameServer, pairingsView } from "../../../../../lib/tournament-admin"
import { updateTournamentWorkflow } from "../../../../../workflows/tournament"
import type { TournamentPairingsBodyType } from "../../../validators"

// GET /admin/tournaments/:id/pairings: a scheduled tournament's field, next round's
// pairings and round times (from the game server).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ view: await pairingsView(req.params.id) })
}

// POST /admin/tournaments/:id/pairings:
//   lock:  close registration now and make the pairings,
//   swap:  swap two players in the next round's pairings,
//   seeds: swap two players' knockout seeds (before the start),
//   reset: back to the computed pairings for the next round.
export const POST = async (req: AuthenticatedMedusaRequest<TournamentPairingsBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  const id = req.params.id
  if (b.action === "lock") {
    await updateTournamentWorkflow(req.scope).run({ input: { id, data: { registration_closes_at: new Date() } } })
    await nudgeGameServer(req.scope, id)
    return res.json({ message: "Registration is closed. The pairings appear in a few seconds." })
  }
  if ((b.action === "swap" || b.action === "seeds") && (!b.a || !b.b)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pick two players.")
  await changePairings(id, b.action, b.a, b.b, req.auth_context.actor_id)
  res.json({ message: b.action === "reset" ? "Back to the system's pairings." : "Swapped." })
}
