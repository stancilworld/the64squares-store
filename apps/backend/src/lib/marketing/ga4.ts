import crypto from "node:crypto"
import { type Consent, type EventData, type EventItem, GA4_NAMES, apiBase, round2 } from "./events"
import type { SendResult } from "./meta"
import type { EventName } from "./settings"

// Google Analytics 4 Measurement Protocol, for the events only the store knows about
// (purchase, refund, sign-up): https://developers.google.com/analytics/devguides/collection/protocol/ga4
export const gaBase = () => apiBase("ga", "https://www.google-analytics.com")

export const ga4Items = (items: EventItem[] | undefined, idMode: "variant" | "product" | "sku") =>
  (items ?? []).map((i) => ({
    item_id: idMode === "sku" ? i.sku || i.variant_id || i.product_id : idMode === "variant" ? i.variant_id || i.product_id : i.product_id,
    ...(i.name ? { item_name: i.name } : {}),
    ...(i.variant ? { item_variant: i.variant } : {}),
    ...(i.category ? { item_category: i.category } : {}),
    ...(i.price != null ? { price: round2(i.price) } : {}),
    quantity: i.quantity ?? 1,
  }))

// GA4's client id from the _ga cookie ("GA1.1.123.456" → "123.456"); a made-up one when the
// visitor had none (the event still counts, just not tied to the visit).
export const gaClientId = (cookie: string | null | undefined) => {
  const m = (cookie ?? "").match(/(\d+\.\d+)$/)
  return m ? m[1] : `${crypto.randomInt(1e9, 2e9)}.${Math.floor(Date.now() / 1000)}`
}

export const ga4Event = (args: { name: EventName; data: EventData; idMode: "variant" | "product" | "sku"; time: Date; clientId: string; userId?: string | null; consent: Consent }) => {
  const n = GA4_NAMES[args.name]
  if (!n) return null
  const params: Record<string, unknown> = { engagement_time_msec: 1 }
  if (args.data.currency) params.currency = args.data.currency.toUpperCase()
  if (typeof args.data.value === "number") params.value = round2(args.data.value)
  if (args.data.order_id) params.transaction_id = args.data.order_id
  if (args.data.items?.length) params.items = ga4Items(args.data.items, args.idMode)
  if (args.name === "CompleteRegistration") params.method = "email"
  return {
    client_id: args.clientId,
    ...(args.userId ? { user_id: args.userId } : {}),
    timestamp_micros: args.time.getTime() * 1000,
    consent: { ad_user_data: args.consent.marketing ? "GRANTED" : "DENIED", ad_personalization: args.consent.marketing ? "GRANTED" : "DENIED" },
    events: [{ name: n, params }],
  }
}

const mpUrl = (path: string, measurementId: string, secret: string) =>
  `${gaBase()}${path}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(secret)}`

// Google answers 204 to every hit, even a wrong one; only the debug address checks it.
export const sendToGa4 = async (measurementId: string, secret: string, body: Record<string, unknown>): Promise<SendResult> => {
  try {
    const res = await fetch(mpUrl("/mp/collect", measurementId, secret), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status >= 200 && res.status < 300) return { ok: true, code: res.status, retry: false }
    return { ok: false, code: res.status, error: `Google answered ${res.status}`, retry: res.status === 429 || res.status >= 500 }
  } catch (e) {
    return { ok: false, code: 0, error: `Could not reach Google: ${(e as Error).message}`, retry: true }
  }
}

export const validateGa4 = async (measurementId: string, secret: string, body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> => {
  try {
    const res = await fetch(mpUrl("/debug/mp/collect", measurementId, secret), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const r = (await res.json().catch(() => null)) as { validationMessages?: { description?: string }[] } | null
    if (!res.ok || !r) return { ok: false, message: `Google's checker answered ${res.status}.` }
    const msgs = r.validationMessages ?? []
    if (msgs.length) return { ok: false, message: `Google found a problem: ${msgs.map((m) => m.description).join("; ")}` }
    return {
      ok: true,
      message: "Google accepted a test purchase. (Google doesn't confirm the API secret itself: check Admin → DebugView or Realtime in Google Analytics after the first order.)",
    }
  } catch (e) {
    return { ok: false, message: `Could not reach Google: ${(e as Error).message}` }
  }
}
