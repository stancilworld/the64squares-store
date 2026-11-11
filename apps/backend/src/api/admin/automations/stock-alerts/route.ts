import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AUTOMATION_MODULE } from "../../../../modules/automation"
import type AutomationModuleService from "../../../../modules/automation/service"

// GET /admin/automations/stock-alerts: how many people wait for each sold-out item, plus
// the invite codes' totals (for Marketing → Automatic emails).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s: AutomationModuleService = req.scope.resolve(AUTOMATION_MODULE)
  const [waiting, sent, referrals] = await Promise.all([
    s.listStockAlerts({ notified_at: null }, { take: 5000 }),
    s.listAndCountStockAlerts({ notified_at: { $ne: null } } as never, { take: 1 }),
    s.listReferrals({}, { take: 5000 }),
  ])
  const byVariant = new Map<string, number>()
  for (const w of waiting) byVariant.set(w.variant_id, (byVariant.get(w.variant_id) ?? 0) + 1)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = byVariant.size
    ? await query.graph({ entity: "product_variant", fields: ["id", "title", "product.id", "product.title"], filters: { id: [...byVariant.keys()] } })
    : { data: [] }
  const items = (data as { id: string; title?: string | null; product?: { id: string; title?: string | null } | null }[])
    .map((v) => ({ variant_id: v.id, product_id: v.product?.id ?? null, title: v.product?.title ?? "Item", option: v.title ?? null, waiting: byVariant.get(v.id) ?? 0 }))
    .sort((a, b) => b.waiting - a.waiting)
  res.json({
    stock_alerts: { waiting: waiting.length, sent: sent[1], items },
    referrals: { codes: referrals.length, uses: referrals.reduce((t, r) => t + r.uses, 0), rewards: referrals.reduce((t, r) => t + r.rewards, 0) },
  })
}
