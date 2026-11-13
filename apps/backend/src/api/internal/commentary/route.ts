import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { secretOk, writeCommentary } from "../../../lib/commentary"
import type { CommentaryLineBodyType } from "../../admin/validators"

// POST /internal/commentary: the game server asks for a live commentary line (and its voice
// for featured games). Only the game server knows the shared secret.
export const POST = async (req: MedusaRequest<CommentaryLineBodyType>, res: MedusaResponse) => {
  if (!secretOk(req.headers["x-t64-game-secret"])) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not allowed")
  res.json(await writeCommentary(req.scope, req.validatedBody))
}
