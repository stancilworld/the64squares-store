import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Checkout launch: lets the India region take Razorpay as well as Cash on Delivery
 * (Medusa's system provider). Runs once.
 */
export default async function checkout_v1({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regions = container.resolve(Modules.REGION)
  const payments = container.resolve(Modules.PAYMENT)
  const providers = await payments.listPaymentProviders({}, { select: ["id"] })
  const wanted = ["pp_system_default", "pp_razorpay_razorpay"].filter((id) => providers.some((p) => p.id === id))
  for (const region of await regions.listRegions({}, { relations: ["payment_providers"] } as never)) {
    const current = ((region as unknown as { payment_providers?: { id: string }[] }).payment_providers ?? []).map((p) => p.id)
    const next = [...new Set([...current, ...wanted])]
    if (next.length !== current.length) {
      await updateRegionsWorkflow(container).run({
        input: { selector: { id: region.id }, update: { payment_providers: next } },
      })
      logger.info(`Checkout: ${region.name} now takes ${next.join(", ")}`)
    }
  }
}
