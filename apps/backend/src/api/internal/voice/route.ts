import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { secretOk } from "../../../lib/commentary"
import { getServiceKeys } from "../../../lib/service-keys"
import { loadSiteFeatures } from "../../../lib/site-features"

// GET /internal/voice: the game server asks whether lobby voice is switched on (Website →
// Site features) and for the LiveKit server and keys it signs passes with. Only the game
// server knows the shared secret.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  if (!secretOk(req.headers["x-t64-game-secret"])) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Not allowed")
  const [features, keys] = await Promise.all([loadSiteFeatures(req.scope), getServiceKeys(req.scope)])
  res.json({ enabled: features.lobby_voice.enabled, livekit: keys.livekit })
}
