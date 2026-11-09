// Shapes of /admin/marketing (see src/lib/marketing/admin-view.ts).
export type Integration = "meta_pixel" | "meta_capi" | "ga4" | "google_ads" | "gtm" | "clarity"
export type Status = "not_connected" | "configuration_required" | "testing" | "connected" | "error" | "disabled"
export type EventName =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "RemoveFromCart"
  | "ViewCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "CompleteRegistration"
  | "Lead"
  | "Refund"
export type Platform = "meta_pixel" | "meta_capi" | "ga4" | "ga4_mp" | "google_ads" | "gtm" | "clarity"

export type Settings = {
  consent: { mode: "ask" | "notice"; text: string; policy_url: string }
  meta_pixel: { enabled: boolean; pixel_id: string }
  meta_capi: { enabled: boolean; test_event_code: string; advanced_matching: boolean }
  ga4: { enabled: boolean; measurement_id: string; server_enabled: boolean }
  google_ads: { enabled: boolean; conversion_id: string; purchase_label: string; lead_label: string; enhanced_conversions: boolean }
  gtm: { enabled: boolean; container_id: string }
  clarity: { enabled: boolean; project_id: string }
  content_id: "variant" | "product" | "sku"
  excluded: Partial<Record<Platform, EventName[]>>
  retention_days: number
  checks: Partial<Record<Integration, { ok: boolean; at: string; message: string }>>
}

export type IntegrationState = {
  key: Integration
  label: string
  status: Status
  message: string
  live: boolean
  enabled: boolean
  missing: string[]
  tested: boolean
  last_check: { ok: boolean; at: string; message: string } | null
}

export type SecretInfo = { set: boolean; preview: string | null; source: "admin" | "server" | null }

export type MarketingView = {
  settings: Settings
  integrations: IntegrationState[]
  secrets: { meta_capi_token: SecretInfo; ga4_api_secret: SecretInfo }
  warnings: string[]
  store_url: string
}

export const EVENT_NAMES: EventName[] = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "RemoveFromCart",
  "ViewCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "CompleteRegistration",
  "Lead",
  "Refund",
]

// Plain words for each event, as the shop owner thinks of them.
export const EVENT_LABELS: Record<EventName, string> = {
  PageView: "Page viewed",
  ViewContent: "Product viewed",
  Search: "Searched",
  AddToCart: "Added to cart",
  RemoveFromCart: "Removed from cart",
  ViewCart: "Cart viewed",
  InitiateCheckout: "Checkout started",
  AddPaymentInfo: "Payment step reached",
  Purchase: "Order placed",
  CompleteRegistration: "Account created",
  Lead: "Message or newsletter sign-up",
  Refund: "Refund",
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta_pixel: "Meta Pixel",
  meta_capi: "Meta Conversions API",
  ga4: "Google Analytics 4",
  ga4_mp: "GA4 (server)",
  google_ads: "Google Ads",
  gtm: "Tag Manager",
  clarity: "Clarity",
}

export const STATUS_BADGE: Record<Status, { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }> = {
  connected: { label: "Connected", color: "green" },
  configuration_required: { label: "Configuration required", color: "orange" },
  testing: { label: "Testing", color: "blue" },
  error: { label: "Error", color: "red" },
  disabled: { label: "Disabled", color: "grey" },
  not_connected: { label: "Not connected", color: "grey" },
}

export const DELIVERY_BADGE: Record<string, { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }> = {
  success: { label: "Delivered", color: "green" },
  browser: { label: "Sent by browser", color: "blue" },
  pending: { label: "Pending", color: "orange" },
  failed: { label: "Failed", color: "red" },
  skipped: { label: "Skipped", color: "grey" },
}
