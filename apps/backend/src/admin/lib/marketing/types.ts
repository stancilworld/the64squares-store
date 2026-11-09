// Shapes of /admin/marketing (see src/lib/marketing/admin-view.ts).
export type Integration =
  | "meta_pixel"
  | "meta_capi"
  | "ga4"
  | "google_ads"
  | "gtm"
  | "clarity"
  | "pinterest"
  | "snapchat"
  | "microsoft_ads"
  | "linkedin"
  | "whatsapp"
  | "brevo"
  | "mailchimp"
  | "klaviyo"
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
  | "AbandonedCart"
  | "OrderShipped"
  | "Subscribe"
export type Platform =
  | "meta_pixel"
  | "meta_capi"
  | "ga4"
  | "ga4_mp"
  | "google_ads"
  | "gtm"
  | "clarity"
  | "pinterest_tag"
  | "pinterest_capi"
  | "snap_pixel"
  | "snap_capi"
  | "uet"
  | "uet_capi"
  | "linkedin_tag"
  | "linkedin_capi"
  | "whatsapp"
  | "brevo"
  | "mailchimp"
  | "klaviyo"

export type Settings = {
  consent: { mode: "ask" | "notice"; text: string; policy_url: string }
  meta_pixel: { enabled: boolean; pixel_id: string }
  meta_capi: { enabled: boolean; test_event_code: string; advanced_matching: boolean }
  ga4: { enabled: boolean; measurement_id: string; server_enabled: boolean }
  google_ads: { enabled: boolean; conversion_id: string; purchase_label: string; lead_label: string; enhanced_conversions: boolean }
  gtm: { enabled: boolean; container_id: string }
  clarity: { enabled: boolean; project_id: string }
  pinterest: { enabled: boolean; tag_id: string; capi_enabled: boolean; ad_account_id: string; test_mode: boolean }
  snapchat: { enabled: boolean; pixel_id: string; capi_enabled: boolean }
  microsoft_ads: { enabled: boolean; tag_id: string; capi_enabled: boolean }
  linkedin: { enabled: boolean; partner_id: string; purchase_conversion_id: string; lead_conversion_id: string; capi_enabled: boolean; ad_account_id: string }
  whatsapp: { enabled: boolean; phone_number_id: string; language: string; template_order: string; template_shipped: string; template_abandoned: string; test_number: string }
  brevo: { enabled: boolean; list_id: string }
  mailchimp: { enabled: boolean; audience_id: string }
  klaviyo: { enabled: boolean; list_id: string }
  automation: { abandoned_enabled: boolean; abandoned_after_hours: number }
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

export type SecretInfo = { name: string; set: boolean; preview: string | null; source: "admin" | "server" | null }
export type SecretName = "meta" | "ga4" | "pinterest" | "snapchat" | "microsoft" | "linkedin" | "whatsapp" | "whatsapp_app_secret" | "brevo" | "mailchimp" | "klaviyo"

export type Webhook = {
  id: string
  url: string
  events: EventName[]
  enabled: boolean
  secret_last4: string
  created_at: string
  last_test: { ok: boolean; at: string; message: string } | null
}

export type MarketingView = {
  settings: Settings
  integrations: IntegrationState[]
  secrets: Record<SecretName, SecretInfo>
  webhooks: Webhook[]
  whatsapp_webhook_url: string
  whatsapp_verify_token: string
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
  "AbandonedCart",
  "OrderShipped",
  "Subscribe",
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
  AbandonedCart: "Checkout left unfinished",
  OrderShipped: "Order shipped",
  Subscribe: "Subscribed to emails",
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta_pixel: "Meta Pixel",
  meta_capi: "Meta Conversions API",
  ga4: "Google Analytics 4",
  ga4_mp: "GA4 (server)",
  google_ads: "Google Ads",
  gtm: "Tag Manager",
  clarity: "Clarity",
  pinterest_tag: "Pinterest Tag",
  pinterest_capi: "Pinterest (server)",
  snap_pixel: "Snap Pixel",
  snap_capi: "Snapchat (server)",
  uet: "Microsoft UET",
  uet_capi: "Microsoft (server)",
  linkedin_tag: "LinkedIn Tag",
  linkedin_capi: "LinkedIn (server)",
  whatsapp: "WhatsApp",
  brevo: "Brevo",
  mailchimp: "Mailchimp",
  klaviyo: "Klaviyo",
}

// A delivery's platform name, including webhook endpoints ("webhook_<id>").
export const platformLabel = (p: string, webhooks: { id: string; url: string }[] = []) => {
  if (p.startsWith("webhook_")) {
    const ep = webhooks.find((w) => `webhook_${w.id}` === p)
    try {
      return `Webhook ${ep ? new URL(ep.url).host : ""}`.trim()
    } catch {
      return "Webhook"
    }
  }
  return PLATFORM_LABELS[p as Platform] ?? p
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
