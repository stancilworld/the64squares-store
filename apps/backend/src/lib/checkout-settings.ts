import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import { getServiceKeys } from "./service-keys"
import ContentModuleService from "../modules/content/service"

// Checkout settings, editable in the admin (Settings → Payments & delivery).
export const CHECKOUT_SETTINGS_KEY = "checkout_settings"

export type CheckoutSettings = {
  cod_enabled: boolean
  // Highest order value allowed for Cash on Delivery, in rupees. null = no limit.
  cod_max: number | null
  online_enabled: boolean
  // Shown under the address form and in the order summary.
  delivery_text: string
  // Where "new order" alerts go. Empty = no alerts.
  order_alert_email: string
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  cod_enabled: true,
  cod_max: null,
  online_enabled: true,
  delivery_text: "Free delivery across India in 5–9 days.",
  order_alert_email: process.env.STANCIL_OWNER_EMAIL || "stancilworld.in@gmail.com",
}

export const resolveCheckoutSettings = (stored: Record<string, unknown> | null | undefined): CheckoutSettings => ({
  ...DEFAULT_CHECKOUT_SETTINGS,
  ...((stored ?? {}) as Partial<CheckoutSettings>),
})

export const loadCheckoutSettings = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveCheckoutSettings(await content.getSettingValue(CHECKOUT_SETTINGS_KEY))
}

// True when Razorpay keys for the current mode (test/live) are set, in the admin or on the server.
export const razorpayReady = async (container?: MedusaContainer) => !!(await getServiceKeys(container)).razorpay
