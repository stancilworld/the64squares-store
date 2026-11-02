import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listFlags } from "../../../lib/fairplay"

// GET /admin/fair-play?status=open|warned|banned|cleared|all
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const status = String(req.query.status ?? "open")
  const allowed = ["open", "warned", "banned", "cleared", "all"]
  res.json({ flags: await listFlags(req.scope, allowed.includes(status) ? status : "open") })
}
