import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadPassRules, passWallet } from "../../../../lib/passes"

// GET /store/account/passes: the player's Tournament Pass balance, history and how to earn more.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const [wallet, rules] = await Promise.all([passWallet(req.scope, req.auth_context.actor_id), loadPassRules(req.scope)])
  res.json({ ...wallet, rules })
}
