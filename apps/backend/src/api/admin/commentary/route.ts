import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { commentaryOverview, setCommentary } from "../../../lib/commentary"
import type { CommentarySettingBodyType } from "../validators"

// GET /admin/commentary: live games and tournaments with their commentary settings.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await commentaryOverview(req.scope))
}

// POST /admin/commentary: commentary on or off (and featured, with voice) for the site, a
// tournament or one game. Takes effect at once.
export const POST = async (req: AuthenticatedMedusaRequest<CommentarySettingBodyType>, res: MedusaResponse) => {
  const o = await commentaryOverview(req.scope)
  if (!o.ready) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The game server hasn't set up commentary yet. Start it once, then try again.")
  const b = req.validatedBody
  await setCommentary(req.scope, b, req.auth_context.actor_id)
  res.json({ message: b.enabled ? (b.voice ? "Commentary on, with voice." : "Commentary on (text).") : "Commentary off." })
}
