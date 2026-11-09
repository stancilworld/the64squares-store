import crypto from "node:crypto"
import type { EventName } from "./settings"

// One shape for every event, whatever platform it goes to. Adapters (meta.ts, ga4.ts) turn
// it into each platform's own format, so adding a platform never changes the events.

export type EventItem = {
  product_id: string
  variant_id?: string | null
  sku?: string | null
  name?: string | null
  variant?: string | null
  category?: string | null
  price?: number | null
  quantity?: number | null
}

export type EventData = {
  value?: number | null
  currency?: string | null
  items?: EventItem[]
  search?: string | null
  order_id?: string | null
  // Campaign tags of the visit (first touch): utm_source, utm_medium, utm_campaign...
  utm?: Record<string, string> | null
}

// The customer, for matching on the platforms' side. Hashed before it goes anywhere.
export type Person = {
  email?: string | null
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  external_id?: string | null
}

// The visitor's browser, for matching a server event to the same visit.
export type Visitor = {
  ip?: string | null
  user_agent?: string | null
  fbp?: string | null
  fbc?: string | null
  ga_client_id?: string | null
  page_url?: string | null
}

export type Consent = { analytics: boolean; marketing: boolean }

// Event names on each platform. null: the platform has no such event and it isn't sent.
export const GA4_NAMES: Record<EventName, string | null> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  RemoveFromCart: "remove_from_cart",
  ViewCart: "view_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  CompleteRegistration: "sign_up",
  Lead: "generate_lead",
  Refund: "refund",
}

// Meta's standard events; RemoveFromCart and ViewCart go as custom events; Meta has no refund event.
export const META_NAMES: Record<EventName, { name: string; custom: boolean } | null> = {
  PageView: { name: "PageView", custom: false },
  ViewContent: { name: "ViewContent", custom: false },
  Search: { name: "Search", custom: false },
  AddToCart: { name: "AddToCart", custom: false },
  RemoveFromCart: { name: "RemoveFromCart", custom: true },
  ViewCart: { name: "ViewCart", custom: true },
  InitiateCheckout: { name: "InitiateCheckout", custom: false },
  AddPaymentInfo: { name: "AddPaymentInfo", custom: false },
  Purchase: { name: "Purchase", custom: false },
  CompleteRegistration: { name: "CompleteRegistration", custom: false },
  Lead: { name: "Lead", custom: false },
  Refund: null,
}

export const contentIdOf = (item: EventItem, mode: "variant" | "product" | "sku") =>
  mode === "sku" ? item.sku || item.variant_id || item.product_id : mode === "variant" ? item.variant_id || item.product_id : item.product_id

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex")

// Normalised the way Meta and Google ask, then hashed. Empty values give null.
const clean = {
  email: (v: string) => v.trim().toLowerCase(),
  // Digits with the country code; Indian 10-digit numbers get 91 in front.
  phone: (v: string) => {
    const d = v.replace(/\D/g, "").replace(/^0+/, "")
    return d.length === 10 ? `91${d}` : d
  },
  name: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}]/gu, ""),
  city: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}]/gu, ""),
  state: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}]/gu, ""),
  postcode: (v: string) => v.trim().toLowerCase().replace(/\s/g, ""),
  country: (v: string) => v.trim().toLowerCase().slice(0, 2),
}

export const hashed = (kind: keyof typeof clean, v: string | null | undefined) => {
  if (!v || !String(v).trim()) return null
  const c = clean[kind](String(v))
  return c ? sha256(c) : null
}

// A one-way hash of the email, kept on events so a customer's data can be found and
// deleted on request (Privacy tab), without storing the email itself.
export const customerHash = (email: string | null | undefined) => (email ? sha256(`t64:${email.trim().toLowerCase()}`) : null)

export const round2 = (n: number) => Math.round(n * 100) / 100
