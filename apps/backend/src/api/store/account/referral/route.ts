import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { storeUrl } from "../../../../lib/emails"
import { loadSiteFeatures } from "../../../../lib/site-features"
import { ensureReferralWorkflow } from "../../../../workflows/automations"

// GET /store/account/referral: the customer's invite code (made on first visit).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const r = (await loadSiteFeatures(req.scope)).referrals
  if (!r.enabled || r.give_amount <= 0) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Invites are not available")
  const { result } = await ensureReferralWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, give_amount: r.give_amount, currency_code: "inr" },
  })
  res.json({
    code: result.code,
    link: `${storeUrl()}/?code=${encodeURIComponent(result.code)}`,
    give_amount: r.give_amount,
    get_amount: r.get_amount,
    min_order: r.min_order,
    uses: result.uses,
    rewards: result.rewards,
  })
}
