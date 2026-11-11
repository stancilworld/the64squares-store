import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { handleReferralOrder } from "../lib/automations-run"

// An order with a friend's invite code: count it and send the inviter their reward.
export default async function referralOrder({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    await handleReferralOrder(container, event.data.id)
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`Referral reward for ${event.data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
