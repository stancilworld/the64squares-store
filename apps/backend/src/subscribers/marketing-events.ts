import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { dispatchSoon } from "../lib/marketing/engine"
import { trackServerEventWorkflow } from "../workflows/marketing"

const KIND: Record<string, "purchase" | "refund" | "registration"> = {
  "order.placed": "purchase",
  "payment.refunded": "refund",
  "customer.created": "registration",
}

// Events only the store can vouch for: a confirmed order, a refund, a new account. Sent to
// the ad and analytics platforms that are switched on (Settings → Marketing & integrations).
export default async function marketingEvents({ event, container }: SubscriberArgs<{ id: string }>) {
  const kind = KIND[event.name]
  if (!kind || !event.data?.id) return
  try {
    const { result } = await trackServerEventWorkflow(container).run({ input: { kind, id: event.data.id } })
    dispatchSoon(container, result.ids)
  } catch (e) {
    // Tracking must never get in the way of an order.
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`Marketing: could not record ${event.name} ${event.data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = { event: ["order.placed", "payment.refunded", "customer.created"] }
