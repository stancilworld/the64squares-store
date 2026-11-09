import type { MedusaContainer } from "@medusajs/framework/types"
import { dispatchSoon, findAbandonedCarts } from "../lib/marketing/engine"
import { loadMarketingSettings } from "../lib/marketing/settings"
import { trackServerEventWorkflow } from "../workflows/marketing"

// Every 15 minutes: checkouts left with an email address and not finished become an
// "Abandoned cart" event, once each, for WhatsApp, the email tools and webhooks (each only for
// customers who agreed to it).
export default async function marketingAbandoned(container: MedusaContainer) {
  const s = await loadMarketingSettings(container)
  if (!s.automation.abandoned_enabled) return
  for (const cart of await findAbandonedCarts(container, s.automation.abandoned_after_hours)) {
    try {
      const { result } = await trackServerEventWorkflow(container).run({ input: { kind: "abandoned", id: cart.id } })
      dispatchSoon(container, result.ids)
    } catch {
      // The next run tries again.
    }
  }
}

export const config = {
  name: "marketing-abandoned-carts",
  schedule: "*/15 * * * *",
}
