import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETING_MODULE } from "../../modules/marketing"
import type MarketingModuleService from "../../modules/marketing/service"
import { getServiceKeys } from "../service-keys"
import { type Consent, type EventData, type Person, type Visitor, customerHash } from "./events"
import { ga4Event, gaClientId, sendToGa4 } from "./ga4"
import { metaEvent, sendToMeta } from "./meta"
import { type EventName, type MarketingSettings, type Platform, PLATFORMS, isExcluded, isLive, loadMarketingSettings } from "./settings"

// The event engine: every shop event is recorded once (Event Manager), handed to the
// browser tags that sent it, and queued for the platforms this server sends to itself
// (Meta Conversions API, GA4's server copy). Sending happens in the background with retries.

const svc = (c: MedusaContainer): MarketingModuleService => c.resolve(MARKETING_MODULE)

export const secretsOf = async (c: MedusaContainer) => {
  const k = await getServiceKeys(c)
  return { meta: k.metaCapiToken, ga4: k.ga4ApiSecret }
}

// Waits between tries: 1 min, 5 min, 30 min, 2 h, 6 h; then the delivery is marked failed
// (it can still be retried by hand in the Event Manager).
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000]
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1

type NewEvent = {
  event_id: string
  name: EventName
  source: "browser" | "server"
  page?: string | null
  order_id?: string | null
  customer_hash?: string | null
  data: EventData
  consent: Consent
}

// Records the event; returns null if this event id was recorded before (a repeat).
export const recordEvent = async (c: MedusaContainer, e: NewEvent) => {
  const m = svc(c)
  const [existing] = await m.listMarketingEvents({ event_id: e.event_id }, { take: 1 })
  if (existing) return null
  try {
    return await m.createMarketingEvents({
      event_id: e.event_id,
      name: e.name,
      source: e.source,
      page: e.page ?? null,
      order_id: e.order_id ?? null,
      customer_hash: e.customer_hash ?? null,
      value: typeof e.data.value === "number" ? e.data.value : null,
      currency: e.data.currency ?? null,
      data: sanitise(e.data) as Record<string, unknown>,
      consent: e.consent as unknown as Record<string, unknown>,
    })
  } catch {
    // Two copies arrived at once: the other one was kept.
    return null
  }
}

// What the Event Manager may show: products, amounts, search words and campaign tags only.
const sanitise = (d: EventData) => ({
  ...(d.items?.length
    ? {
        items: d.items.slice(0, 50).map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          sku: i.sku ?? null,
          name: i.name ?? null,
          price: i.price ?? null,
          quantity: i.quantity ?? 1,
        })),
      }
    : {}),
  ...(d.search ? { search: d.search.slice(0, 100) } : {}),
  ...(d.order_id ? { order_id: d.order_id } : {}),
  ...(d.utm && Object.keys(d.utm).length ? { utm: d.utm } : {}),
})

// The browser tags that carried the event (only those switched on are counted).
export const addBrowserDeliveries = async (c: MedusaContainer, event: { event_id: string; name: string; order_id?: string | null }, platforms: Platform[]) => {
  if (!platforms.length) return
  const m = svc(c)
  const existing = await m.listMarketingDeliveries({ event_id: event.event_id }, { select: ["platform"] })
  const have = new Set(existing.map((d) => d.platform))
  const rows = platforms
    .filter((p) => PLATFORMS[p]?.channel === "browser" && !have.has(p))
    .map((p) => ({
      event_id: event.event_id,
      event_name: event.name,
      platform: p,
      channel: "browser",
      status: "browser",
      attempts: 1,
      delivered_at: new Date(),
      last_attempt_at: new Date(),
      order_id: event.order_id ?? null,
    }))
  if (rows.length) await m.createMarketingDeliveries(rows).catch(() => {})
}

// Queues the server copies of an event. Returns the new delivery ids.
export const queueServerDeliveries = async (
  c: MedusaContainer,
  args: { event_id: string; name: EventName; data: EventData; consent: Consent; visitor: Visitor; person: Person | null; time?: Date; settings?: MarketingSettings }
) => {
  const s = args.settings ?? (await loadMarketingSettings(c))
  const secrets = await secretsOf(c)
  const time = args.time ?? new Date()
  const rows: Record<string, unknown>[] = []
  const skip = (p: Platform, why: string) =>
    rows.push({ event_id: args.event_id, event_name: args.name, platform: p, channel: "server", status: "skipped", attempts: 0, last_error: why, order_id: args.data.order_id ?? null })

  // Meta Conversions API: needs marketing consent.
  if (isLive(s, "meta_capi", secrets) && isLive(s, "meta_pixel", secrets) && !isExcluded(s, "meta_capi", args.name)) {
    const ev = metaEvent({ name: args.name, eventId: args.event_id, time, data: args.data, visitor: args.visitor, person: args.person, advanced: s.meta_capi.advanced_matching, idMode: s.content_id })
    if (ev) {
      if (!args.consent.marketing) skip("meta_capi", "The visitor did not allow marketing cookies.")
      else rows.push({ event_id: args.event_id, event_name: args.name, platform: "meta_capi", channel: "server", status: "pending", attempts: 0, next_attempt_at: new Date(), payload: ev, order_id: args.data.order_id ?? null })
    }
  }
  // GA4 server copy: only for what the store itself knows (purchase, refund, sign-up).
  if (isLive(s, "ga4", secrets) && s.ga4.server_enabled && ["Purchase", "Refund", "CompleteRegistration"].includes(args.name) && !isExcluded(s, "ga4_mp", args.name)) {
    const body = ga4Event({ name: args.name, data: args.data, idMode: s.content_id, time, clientId: gaClientId(args.visitor.ga_client_id), userId: null, consent: args.consent })
    if (body) {
      if (!args.consent.analytics && args.name !== "Refund") skip("ga4_mp", "The visitor did not allow analytics cookies.")
      else rows.push({ event_id: args.event_id, event_name: args.name, platform: "ga4_mp", channel: "server", status: "pending", attempts: 0, next_attempt_at: new Date(), payload: body, order_id: args.data.order_id ?? null })
    }
  }
  if (!rows.length) return []
  const m = svc(c)
  const created: string[] = []
  for (const r of rows) {
    try {
      const d = await m.createMarketingDeliveries(r)
      if (d.status === "pending") created.push(d.id)
    } catch {
      // Already queued for this platform (same event id): sent once only.
    }
  }
  return created
}

const PRIVATE_KEYS = ["user_data"]
// After delivery, customer details are removed from the stored copy.
const stripPersonal = (payload: Record<string, unknown> | null) => {
  if (!payload) return payload
  const out = { ...payload }
  for (const k of PRIVATE_KEYS) if (k in out) out[k] = { removed_after_delivery: true }
  return out
}

let running = false

// Sends what's due. `ids`: just these (right after they're queued). Otherwise, everything
// waiting whose time has come (the background job, every minute).
export const dispatchDue = async (c: MedusaContainer, opts: { ids?: string[]; limit?: number } = {}) => {
  if (!opts.ids && running) return { sent: 0, failed: 0 }
  if (!opts.ids) running = true
  let sent = 0
  let failed = 0
  try {
    const m = svc(c)
    const now = new Date()
    const due = opts.ids
      ? await m.listMarketingDeliveries({ id: opts.ids, status: "pending" })
      : await m.listMarketingDeliveries(
          // Fresh ones are being sent by the request that queued them; give it 30 seconds.
          { status: "pending", next_attempt_at: { $lte: now }, created_at: { $lt: new Date(now.getTime() - 30_000) } } as never,
          { take: opts.limit ?? 50, order: { next_attempt_at: "ASC" } }
        )
    if (!due.length) return { sent, failed }
    const s = await loadMarketingSettings(c)
    const secrets = await secretsOf(c)
    for (const d of due) {
      const payload = d.payload as Record<string, unknown> | null
      let r: { ok: boolean; code: number; error?: string; retry: boolean; retryAfterMs?: number }
      if (d.platform === "meta_capi") {
        if (!secrets.meta || !s.meta_pixel.pixel_id) r = { ok: false, code: 0, error: "Meta access token or Pixel ID is missing.", retry: false }
        else r = await sendToMeta(s.meta_pixel.pixel_id, secrets.meta, payload ?? {}, s.meta_capi.test_event_code || undefined)
      } else if (d.platform === "ga4_mp") {
        if (!secrets.ga4 || !s.ga4.measurement_id) r = { ok: false, code: 0, error: "GA4 Measurement ID or API secret is missing.", retry: false }
        else r = await sendToGa4(s.ga4.measurement_id, secrets.ga4, payload ?? {})
      } else {
        r = { ok: false, code: 0, error: `No sender for ${d.platform}.`, retry: false }
      }
      const attempts = (d.attempts ?? 0) + 1
      if (r.ok) {
        sent++
        await m.updateMarketingDeliveries({
          id: d.id,
          status: "success",
          attempts,
          last_attempt_at: new Date(),
          delivered_at: new Date(),
          response_code: r.code,
          last_error: null,
          next_attempt_at: null,
          payload: stripPersonal(payload),
        })
      } else {
        const giveUp = !r.retry || attempts >= MAX_ATTEMPTS
        if (giveUp) failed++
        const wait = Math.max(r.retryAfterMs ?? 0, BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)])
        await m.updateMarketingDeliveries({
          id: d.id,
          status: giveUp ? "failed" : "pending",
          attempts,
          last_attempt_at: new Date(),
          response_code: r.code || null,
          last_error: (r.error ?? "Unknown error").slice(0, 500),
          next_attempt_at: giveUp ? null : new Date(Date.now() + wait),
        })
      }
    }
  } finally {
    if (!opts.ids) running = false
  }
  return { sent, failed }
}

// Runs the first try in the background so the visitor (or the order) never waits for Meta.
export const dispatchSoon = (c: MedusaContainer, ids: string[]) => {
  if (!ids.length) return
  setImmediate(() => {
    dispatchDue(c, { ids }).catch(() => {})
  })
}

// ------------------------------------------------------------------ server-made events

type OrderRow = {
  id: string
  email?: string | null
  customer_id?: string | null
  currency_code?: string | null
  total?: number | string | null
  metadata?: Record<string, unknown> | null
  cart?: { id: string } | null
  items?: { product_id?: string | null; variant_id?: string | null; variant_sku?: string | null; product_title?: string | null; variant_title?: string | null; title?: string | null; unit_price?: number | string | null; quantity?: number | string | null }[]
  shipping_address?: { first_name?: string | null; last_name?: string | null; city?: string | null; province?: string | null; postal_code?: string | null; country_code?: string | null; phone?: string | null } | null
}

const ORDER_FIELDS = [
  "id",
  "email",
  "customer_id",
  "currency_code",
  "total",
  "metadata",
  "cart.id",
  "items.product_id",
  "items.variant_id",
  "items.variant_sku",
  "items.product_title",
  "items.variant_title",
  "items.title",
  "items.unit_price",
  "items.quantity",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.postal_code",
  "shipping_address.country_code",
  "shipping_address.phone",
]

const loadOrder = async (c: MedusaContainer, id: string): Promise<OrderRow | null> => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id } })
  return (data[0] as OrderRow | undefined) ?? null
}

const orderItems = (o: OrderRow) =>
  (o.items ?? []).map((i) => ({
    product_id: i.product_id ?? "",
    variant_id: i.variant_id ?? null,
    sku: i.variant_sku ?? null,
    name: i.product_title ?? i.title ?? null,
    variant: i.variant_title ?? null,
    price: Number(i.unit_price ?? 0),
    quantity: Number(i.quantity ?? 1),
  }))

const personOf = (o: OrderRow): Person => ({
  email: o.email,
  phone: o.shipping_address?.phone,
  first_name: o.shipping_address?.first_name,
  last_name: o.shipping_address?.last_name,
  city: o.shipping_address?.city,
  state: o.shipping_address?.province,
  postcode: o.shipping_address?.postal_code,
  country: o.shipping_address?.country_code,
  external_id: o.customer_id,
})

// What the browser was doing when checkout started (saved by the collector).
const contextFor = async (c: MedusaContainer, cartId: string | null | undefined) => {
  if (!cartId) return null
  const [ctx] = await svc(c).listMarketingContexts({ cart_id: cartId }, { take: 1 })
  return ctx ?? null
}

const consentFrom = (raw: unknown, mode: "ask" | "notice"): Consent => {
  const r = (raw ?? null) as Partial<Consent> | null
  if (r && typeof r.analytics === "boolean" && typeof r.marketing === "boolean") return { analytics: r.analytics, marketing: r.marketing }
  return mode === "notice" ? { analytics: true, marketing: true } : { analytics: false, marketing: false }
}

export const purchaseEventId = (orderId: string) => `purchase_${orderId}`

// A confirmed order (order.placed): payment is authorised, or it's Cash on Delivery.
export const trackPurchase = async (c: MedusaContainer, orderId: string) => {
  const o = await loadOrder(c, orderId)
  if (!o) return []
  const s = await loadMarketingSettings(c)
  const ctx = await contextFor(c, o.cart?.id)
  const consent = consentFrom(ctx?.consent, s.consent.mode)
  const data: EventData = {
    value: Number(o.total ?? 0),
    currency: (o.currency_code ?? "inr").toUpperCase(),
    items: orderItems(o),
    order_id: o.id,
    utm: (ctx?.utm as Record<string, string> | null) ?? null,
  }
  const eventId = purchaseEventId(o.id)
  const event = await recordEvent(c, { event_id: eventId, name: "Purchase", source: "server", page: ctx?.page ?? null, order_id: o.id, customer_hash: customerHash(o.email), data, consent })
  if (!event) return []
  const visitor: Visitor = { ip: ctx?.ip, user_agent: ctx?.user_agent, fbp: ctx?.fbp, fbc: ctx?.fbc, ga_client_id: ctx?.ga_client_id, page_url: ctx?.page }
  const ids = await queueServerDeliveries(c, { event_id: eventId, name: "Purchase", data, consent, visitor, person: personOf(o), settings: s })
  // The visit details are no longer needed once the purchase is queued.
  if (ctx) await svc(c).deleteMarketingContexts(ctx.id).catch(() => {})
  return ids
}

// Money refunded on an order's payment (payment.refunded).
export const trackRefund = async (c: MedusaContainer, paymentId: string) => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pays } = await query.graph({ entity: "payment", fields: ["id", "currency_code", "refunds.id", "refunds.amount", "refunds.created_at", "payment_collection.order.id"], filters: { id: paymentId } })
  const pay = pays[0] as { id: string; currency_code?: string; refunds?: { id: string; amount: number | string; created_at: string }[]; payment_collection?: { order?: { id: string } | null } | null } | undefined
  const orderId = pay?.payment_collection?.order?.id
  const refund = [...(pay?.refunds ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  if (!pay || !orderId || !refund) return []
  const o = await loadOrder(c, orderId)
  if (!o) return []
  const s = await loadMarketingSettings(c)
  const amount = Number(refund.amount ?? 0)
  const full = Math.abs(amount - Number(o.total ?? 0)) < 0.01
  const data: EventData = { value: amount, currency: (pay.currency_code ?? o.currency_code ?? "inr").toUpperCase(), order_id: o.id, ...(full ? { items: orderItems(o) } : {}) }
  const eventId = `refund_${refund.id}`
  // A refund is the store's own bookkeeping, sent whatever the visitor chose about cookies.
  const consent: Consent = { analytics: true, marketing: false }
  const event = await recordEvent(c, { event_id: eventId, name: "Refund", source: "server", order_id: o.id, customer_hash: customerHash(o.email), data, consent })
  if (!event) return []
  return queueServerDeliveries(c, { event_id: eventId, name: "Refund", data, consent, visitor: {}, person: null, settings: s })
}

// A new customer account (customer.created, only real sign-ups: not guest orders).
export const trackRegistration = async (c: MedusaContainer, customerId: string) => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["id", "email", "phone", "first_name", "last_name", "has_account"], filters: { id: customerId } })
  const cu = data[0] as { id: string; email?: string; phone?: string; first_name?: string; last_name?: string; has_account?: boolean } | undefined
  if (!cu || !cu.has_account) return []
  const s = await loadMarketingSettings(c)
  const eventId = `reg_${cu.id}`
  // The sign-up happens in the visitor's browser, but its choice isn't known here: only
  // sent when tracking doesn't need asking first.
  const consent = consentFrom(null, s.consent.mode)
  const event = await recordEvent(c, { event_id: eventId, name: "CompleteRegistration", source: "server", customer_hash: customerHash(cu.email), data: {}, consent })
  if (!event) return []
  return queueServerDeliveries(c, {
    event_id: eventId,
    name: "CompleteRegistration",
    data: {},
    consent,
    visitor: {},
    person: { email: cu.email, phone: cu.phone, first_name: cu.first_name, last_name: cu.last_name, external_id: cu.id },
    settings: s,
  })
}
