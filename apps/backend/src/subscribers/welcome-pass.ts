import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { loadPassRules } from "../lib/passes"
import { changePassesWorkflow } from "../workflows/passes"

// A new account gets its welcome Tournament Pass straight away.
export default async function welcomePass({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    // Not for guest checkouts: only people who made an account.
    const me = await container.resolve(Modules.CUSTOMER).retrieveCustomer(event.data.id)
    if (!me.has_account) return
    const rules = await loadPassRules(container)
    if (rules.welcome > 0) await changePassesWorkflow(container).run({ input: { customer_id: event.data.id, delta: rules.welcome, reason: "welcome", ref: "welcome" } })
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`Welcome pass for ${event.data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = { event: "customer.created" }
