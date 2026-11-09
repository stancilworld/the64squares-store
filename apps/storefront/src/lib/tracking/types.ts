// The tags the website loads (Settings → Marketing & integrations in the admin). Only public
// ids: secret keys never leave the server.
export type MarketingConfig = {
  consent: { mode: "ask" | "notice"; text: string; policy_url: string }
  content_id: "variant" | "product" | "sku"
  meta_pixel: { pixel_id: string } | null
  ga4: { measurement_id: string; purchase_from_server: boolean } | null
  google_ads: { conversion_id: string; purchase_label: string | null; lead_label: string | null; enhanced_conversions: boolean } | null
  gtm: { container_id: string } | null
  clarity: { project_id: string } | null
  pinterest: { tag_id: string } | null
  snapchat: { pixel_id: string } | null
  microsoft_ads: { tag_id: string } | null
  linkedin: { partner_id: string; purchase_conversion_id: string | null; lead_conversion_id: string | null } | null
  excluded: Partial<Record<Platform, EventName[]>>
  check: { nonce: string; integrations: string[] } | null
}

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
  | "Lead"

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

export type TrackItem = {
  product_id: string
  variant_id?: string | null
  sku?: string | null
  name?: string | null
  variant?: string | null
  category?: string | null
  price?: number | null
  quantity?: number | null
}

export type TrackData = {
  value?: number | null
  currency?: string | null
  items?: TrackItem[]
  search?: string | null
  cart_id?: string | null
  order_id?: string | null
  // For Google Ads enhanced conversions on the order page (Google hashes them in the browser).
  person?: { email?: string | null; phone?: string | null } | null
  // Set for events that must keep a known id (a purchase: purchase_<order id>).
  event_id?: string
}

export type Consent = { analytics: boolean; marketing: boolean }

export const NO_TRACKING: MarketingConfig = {
  consent: { mode: "ask", text: "", policy_url: "" },
  content_id: "variant",
  meta_pixel: null,
  ga4: null,
  google_ads: null,
  gtm: null,
  clarity: null,
  pinterest: null,
  snapchat: null,
  microsoft_ads: null,
  linkedin: null,
  excluded: {},
  check: null,
}

export const anyTag = (c: MarketingConfig) =>
  !!(c.meta_pixel || c.ga4 || c.google_ads || c.gtm || c.clarity || c.pinterest || c.snapchat || c.microsoft_ads || c.linkedin)

// Tags that need marketing consent (ads), as opposed to analytics.
export const anyAdTag = (c: MarketingConfig) => !!(c.meta_pixel || c.google_ads || c.gtm || c.pinterest || c.snapchat || c.microsoft_ads || c.linkedin)
