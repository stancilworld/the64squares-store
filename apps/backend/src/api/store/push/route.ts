import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { pushKeys } from "../../../lib/push"
import { loadSiteFeatures } from "../../../lib/site-features"

// GET /store/push: whether the website offers notifications, and its public key.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const f = (await loadSiteFeatures(req.scope)).push
  if (!f.enabled) return res.json({ enabled: false })
  const keys = await pushKeys(req.scope, true)
  res.json({ enabled: !!keys, public_key: keys?.publicKey ?? null, prompt_after_seconds: f.prompt_after_seconds })
}
