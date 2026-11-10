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
  // PayU (its own switch; both gateways can be on, and checkout then offers both).
  payu_enabled: boolean
  // Shown under the address form and in the order summary.
  delivery_text: string
  // Where "new order" alerts go. Empty = no alerts.
  order_alert_email: string
  // Product page "Arrives by" date: days to pack an in-stock order, then days in transit
  // (the latest of the usual range). A product's own "days to make" replaces the packing days.
  dispatch_days: number
  transit_days: number
  // Product page lines: where orders ship from, and the returns promise.
  dispatch_from: string
  returns_text: string
  // "In 5+ carts": real count of open carts holding the product in the last 3 days, shown
  // only when at least in_carts_min carts do.
  in_carts_enabled: boolean
  in_carts_min: number
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  cod_enabled: true,
  cod_max: null,
  online_enabled: true,
  payu_enabled: true,
  delivery_text: "Free delivery across India in 3–7 days.",
  order_alert_email: process.env.OWNER_EMAIL || "",
  dispatch_days: 1,
  transit_days: 7,
  dispatch_from: "India",
  returns_text: "Returns accepted within 7 days of delivery",
  in_carts_enabled: true,
  in_carts_min: 5,
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

// True when PayU's Merchant Key and Salt for its current mode are set.
export const payuReady = async (container?: MedusaContainer) => !!(await getServiceKeys(container)).payu
