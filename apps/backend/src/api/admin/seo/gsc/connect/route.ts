import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { authUrl, makeState } from "../../../../../lib/search-console"

// POST /admin/seo/gsc/connect: where to send the admin to sign in with Google.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const url = await authUrl(req.scope, makeState(req.auth_context.actor_id))
  if (!url) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Add the Google Client ID and Secret first (Settings → Payments & delivery → Keys).")
  res.json({ url })
}
