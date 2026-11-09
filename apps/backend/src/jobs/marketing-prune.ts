import type { MedusaContainer } from "@medusajs/framework/types"
import { MARKETING_MODULE } from "../modules/marketing"
import type MarketingModuleService from "../modules/marketing/service"
import { loadMarketingSettings } from "../lib/marketing/settings"

// Keeps the Event Manager to the number of days set in Advanced (30 by default), and drops
// unused checkout visit details after 7 days.
export default async function marketingPrune(container: MedusaContainer) {
  const m: MarketingModuleService = container.resolve(MARKETING_MODULE)
  const s = await loadMarketingSettings(container)
  const cutoff = new Date(Date.now() - s.retention_days * 86_400_000)
  for (let i = 0; i < 20; i++) {
    const old = await m.listMarketingEvents({ created_at: { $lt: cutoff } } as never, { select: ["id", "event_id"], take: 2000 })
    if (!old.length) break
    const dels = await m.listMarketingDeliveries({ event_id: old.map((e) => e.event_id) }, { select: ["id"], take: 20000 })
    if (dels.length) await m.deleteMarketingDeliveries(dels.map((d) => d.id))
    await m.deleteMarketingEvents(old.map((e) => e.id))
  }
  const stale = await m.listMarketingContexts({ created_at: { $lt: new Date(Date.now() - 7 * 86_400_000) } } as never, { select: ["id"], take: 5000 })
  if (stale.length) await m.deleteMarketingContexts(stale.map((x) => x.id))
}

export const config = {
  name: "marketing-prune",
  schedule: "45 3 * * *",
}
