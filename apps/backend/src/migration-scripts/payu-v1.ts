import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * PayU: lets every region take PayU as well (it only shows at checkout once its keys are
 * saved in the admin and it's switched on). Runs once.
 */
export default async function payu_v1({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regions = container.resolve(Modules.REGION)
  const payments = container.resolve(Modules.PAYMENT)
  const providers = await payments.listPaymentProviders({ id: ["pp_payu_payu"] }, { select: ["id"] })
  if (!providers.length) {
    logger.warn("PayU: payment provider not loaded; nothing to do.")
    return
  }
  for (const region of await regions.listRegions({}, { relations: ["payment_providers"] } as never)) {
    const current = ((region as unknown as { payment_providers?: { id: string }[] }).payment_providers ?? []).map((p) => p.id)
    if (current.includes("pp_payu_payu")) continue
    await updateRegionsWorkflow(container).run({
      input: { selector: { id: region.id }, update: { payment_providers: [...current, "pp_payu_payu"] } },
    })
    logger.info(`PayU: ${region.name} now takes ${[...current, "pp_payu_payu"].join(", ")}`)
  }
}
