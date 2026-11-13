import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SHOWCASE_MODULE } from "../../../../modules/showcase"
import type ShowcaseModuleService from "../../../../modules/showcase/service"

// GET /store/showcase/claims: what this player has claimed (so the website shows "Claimed").
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s = req.scope.resolve<ShowcaseModuleService>(SHOWCASE_MODULE)
  const claims = await s.listShowcaseClaims({ customer_id: req.auth_context.actor_id }, { take: 200, order: { created_at: "DESC" } })
  res.json({ claims: claims.map((c) => ({ ad_id: c.ad_id, given: c.reward })) })
}
