import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { staffFor } from "../../../staff-guard"

// GET /admin/staff/me: the signed-in person's role and switched-on permissions.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const staff = await staffFor(req, req.auth_context.actor_id)
  res.json({ staff })
}
