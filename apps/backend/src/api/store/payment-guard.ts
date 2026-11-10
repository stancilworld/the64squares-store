import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadCheckoutSettings, payuReady, razorpayReady } from "../../lib/checkout-settings"

// Before a payment session is made at checkout: applies the admin's Payments & delivery
// settings (Cash on Delivery on/off and its order limit, online payment on/off).
export async function paymentMethodGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const provider = String((req.body as { provider_id?: string })?.provider_id ?? "")
  const settings = await loadCheckoutSettings(req.scope)
  if (provider === "pp_system_default") {
    if (!settings.cod_enabled) {
      return res.status(400).json({ type: "not_allowed", message: "Cash on Delivery isn't available right now. Please pay online." })
    }
    if (settings.cod_max) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({ entity: "payment_collection", fields: ["amount"], filters: { id: req.params.id } })
      if (Number(data[0]?.amount ?? 0) > settings.cod_max) {
        return res.status(400).json({
          type: "not_allowed",
          message: `Cash on Delivery is available for orders up to ₹${settings.cod_max.toLocaleString("en-IN")}. Please pay online.`,
        })
      }
    }
  }
  if (provider === "pp_razorpay_razorpay" && !(settings.online_enabled && (await razorpayReady(req.scope)))) {
    return res.status(400).json({ type: "not_allowed", message: "Online payment isn't available right now. Please choose Cash on Delivery." })
  }
  if (provider === "pp_payu_payu" && !(settings.payu_enabled && (await payuReady(req.scope)))) {
    return res.status(400).json({ type: "not_allowed", message: "PayU isn't available right now. Please choose another way to pay." })
  }
  next()
}
