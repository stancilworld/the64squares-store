import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { passWallet } from "../../../../lib/passes"
import { changePassesWorkflow } from "../../../../workflows/passes"
import type { PassGrantBodyType } from "../../validators"

// POST /admin/tournament-passes/grant: give a player passes (or take some back), with a note.
export const POST = async (req: AuthenticatedMedusaRequest<PassGrantBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  let id = b.customer_id
  if (!id && b.email) {
    const [c] = await req.scope.resolve(Modules.CUSTOMER).listCustomers({ email: b.email.toLowerCase() }, { take: 1 })
    if (!c) throw new MedusaError(MedusaError.Types.NOT_FOUND, "No customer has that email.")
    id = c.id
  }
  await changePassesWorkflow(req.scope).run({
    input: { customer_id: id!, delta: b.delta, reason: b.delta > 0 ? "admin" : "removed", note: b.note, created_by: req.auth_context.actor_id },
  })
  res.json({ wallet: await passWallet(req.scope, id!) })
}
