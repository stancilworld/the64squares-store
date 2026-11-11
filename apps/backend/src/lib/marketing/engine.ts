import type { MedusaContainer } from "@medusajs/framework/types"
import crypto from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETING_MODULE } from "../../modules/marketing"
import type MarketingModuleService from "../../modules/marketing/service"
import { storeUrl } from "../emails"
import { getServiceKeys } from "../service-keys"
import { type Consent, type EventData, type OptIn, type Person, type Visitor, customerHash } from "./events"
import { excludedFor, senderByPlatform, sendersFor } from "./senders"
import { type EventName, type MarketingSettings, type Platform, PLATFORMS, SECRET_NAMES, type Secrets, loadMarketingSettings } from "./settings"

// The event engine: every shop event is recorded once (Event Manager), handed to the
// browser tags that sent it, and queued for the platforms this server sends to itself
// (Meta Conversions API, GA4's server copy). Sending happens in the background with retries.

const svc = (c: MedusaContainer): MarketingModuleService => c.resolve(MARKETING_MODULE)

export const secretsOf = async (c: MedusaContainer): Promise<Secrets> => {
  const k = await getServiceKeys(c)
  return Object.fromEntries(Object.entries(SECRET_NAMES).map(([short, name]) => [short, k.marketing[name] || undefined])) as Secrets
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
  ...(typeof d.results === "number" ? { results: d.results } : {}),
  ...(d.visit ? { visit: d.visit } : {}),
  ...(d.ref ? { ref: d.ref } : {}),
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

// Queues the server copies of an event (every switched-on platform that takes it). Returns
// the new delivery ids.
export const queueServerDeliveries = async (
  c: MedusaContainer,
  args: {
    event_id: string
    name: EventName
    data: EventData
    consent: Consent
    visitor: Visitor
    person: Person | null
    optin?: OptIn | null
    time?: Date
    settings?: MarketingSettings
  }
) => {
  const s = args.settings ?? (await loadMarketingSettings(c))
  const k = await secretsOf(c)
  const time = args.time ?? new Date()
  const rows: Record<string, unknown>[] = []
  for (const sender of sendersFor(s, k)) {
    if (excludedFor(s, sender.platform, args.name)) continue
    const a = { name: args.name, eventId: args.event_id, time, data: args.data, visitor: args.visitor, person: args.person, consent: args.consent, optin: args.optin ?? null, s, k }
    const payload = sender.build(a)
    if (!payload) continue
    const why = sender.blocked(a)
    const base = { event_id: args.event_id, event_name: args.name, platform: sender.platform, channel: "server", order_id: args.data.order_id ?? null }
    rows.push(why ? { ...base, status: "skipped", attempts: 0, last_error: why } : { ...base, status: "pending", attempts: 0, next_attempt_at: new Date(), payload })
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

// After delivery, customer details are removed from the stored copy.
export const stripPersonal = (payload: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!payload) return payload
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== "object") return v
    return Object.fromEntries(Object.entries(v).map(([k, x]) => (PERSONAL_KEYS.has(k) ? [k, "removed after delivery"] : [k, walk(x)])))
  }
  return walk(payload) as Record<string, unknown>
}

// Keys whose values are about a person (contact details, ids, IP address, browser).
export const PERSONAL_KEYS = new Set([
  "user_data",
  "userData",
  "userIds",
  "userInfo",
  "email",
  "email_address",
  "email_id",
  "identifiers",
  "phone",
  "phone_number",
  "to",
  "customer",
  "attributes_personal",
  "merge_fields",
  "hash",
  "client_id",
  "first_name",
  "last_name",
  "FIRSTNAME",
  "LASTNAME",
])

// The platform's id for what it received (a WhatsApp message id), to follow its delivery.
const externalIdOf = (body: unknown) => {
  const id = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id
  return typeof id === "string" ? id.slice(0, 200) : null
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
    const k = await secretsOf(c)
    for (const d of due) {
      const payload = d.payload as Record<string, unknown> | null
      const sender = senderByPlatform(s, d.platform)
      const r = sender
        ? await sender.send(payload ?? {}, s, k)
        : { ok: false, code: 0, error: `${d.platform} is no longer set up.`, retry: false, retryAfterMs: undefined as number | undefined, body: undefined }
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
          external_id: externalIdOf(r.body),
          external_status: externalIdOf(r.body) ? "sent" : null,
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
  display_id?: number | null
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
  "display_id",
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

// What the customer ticked at checkout (cart metadata, copied to the order).
export const optinFrom = (metadata: Record<string, unknown> | null | undefined): OptIn => {
  const o = (metadata?.t64_optin ?? null) as Partial<OptIn> | null
  return { email: o?.email === true, whatsapp: o?.whatsapp === true }
}

const visitorFrom = (ctx: Awaited<ReturnType<typeof contextFor>>): Visitor => ({
  ip: ctx?.ip,
  user_agent: ctx?.user_agent,
  fbp: ctx?.fbp,
  fbc: ctx?.fbc,
  ga_client_id: ctx?.ga_client_id,
  page_url: ctx?.page,
  ids: (ctx?.click_ids as Visitor["ids"]) ?? null,
})

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
    extra: { display_id: o.display_id ?? null },
  }
  const eventId = purchaseEventId(o.id)
  const event = await recordEvent(c, { event_id: eventId, name: "Purchase", source: "server", page: ctx?.page ?? null, order_id: o.id, customer_hash: customerHash(o.email), data, consent })
  if (!event) return []
  const optin = optinFrom(o.metadata)
  const person = personOf(o)
  const ids = await queueServerDeliveries(c, { event_id: eventId, name: "Purchase", data, consent, visitor: visitorFrom(ctx), person, optin, settings: s })
  // Ticked "email me news and offers" at checkout: a subscription too.
  if (optin.email && o.email) ids.push(...(await trackSubscribe(c, { email: o.email, first_name: person.first_name, last_name: person.last_name, source: "checkout" })))
  // The visit details are no longer needed once the purchase is queued.
  if (ctx) await svc(c).deleteMarketingContexts(ctx.id).catch(() => {})
  return ids
}

// Marked as shipped in the admin (shipment.created, with the fulfillment id).
export const trackShipped = async (c: MedusaContainer, fulfillmentId: string) => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({ entity: "order_fulfillment", fields: ["order_id"], filters: { fulfillment_id: fulfillmentId } })
  const orderId = (links[0] as { order_id?: string } | undefined)?.order_id
  if (!orderId) return []
  const o = await loadOrder(c, orderId)
  if (!o) return []
  const { data: fs } = await query.graph({ entity: "fulfillment", fields: ["id", "labels.tracking_number", "labels.tracking_url"], filters: { id: fulfillmentId } })
  const label = ((fs[0] as { labels?: { tracking_number?: string; tracking_url?: string }[] } | undefined)?.labels ?? [])[0]
  const s = await loadMarketingSettings(c)
  const data: EventData = {
    value: Number(o.total ?? 0),
    currency: (o.currency_code ?? "inr").toUpperCase(),
    items: orderItems(o),
    order_id: o.id,
    extra: { display_id: o.display_id ?? null, tracking_number: label?.tracking_number ?? null, tracking_url: label?.tracking_url ?? null },
  }
  const eventId = `shipped_${fulfillmentId}`
  // Shipping news is a service message, not marketing: it follows the customer's opt-ins only.
  const consent: Consent = { analytics: false, marketing: false }
  const event = await recordEvent(c, { event_id: eventId, name: "OrderShipped", source: "server", order_id: o.id, customer_hash: customerHash(o.email), data, consent })
  if (!event) return []
  return queueServerDeliveries(c, { event_id: eventId, name: "OrderShipped", data, consent, visitor: {}, person: personOf(o), optin: optinFrom(o.metadata), settings: s })
}

// A newsletter sign-up, or "email me news and offers" ticked at checkout.
export const trackSubscribe = async (c: MedusaContainer, p: { email: string; first_name?: string | null; last_name?: string | null; source: string }) => {
  const email = p.email.trim().toLowerCase()
  const eventId = `subscribe_${customerHash(email)!.slice(0, 32)}`
  const consent: Consent = { analytics: false, marketing: false }
  const event = await recordEvent(c, { event_id: eventId, name: "Subscribe", source: "server", customer_hash: customerHash(email), data: { extra: { source: p.source } }, consent })
  if (!event) return []
  return queueServerDeliveries(c, {
    event_id: eventId,
    name: "Subscribe",
    data: { extra: { source: p.source } },
    consent,
    visitor: {},
    person: { email, first_name: p.first_name, last_name: p.last_name },
    optin: { email: true, whatsapp: false },
  })
}

// ------------------------------------------------------------------ abandoned carts

// A link back to an abandoned cart, signed so cart ids can't be guessed into it.
const recoverySecret = () => `${process.env.JWT_SECRET || "supersecret"}|marketing-recover`
export const recoveryToken = (cartId: string) => `${cartId}.${crypto.createHmac("sha256", recoverySecret()).update(cartId).digest("base64url").slice(0, 22)}`
export const cartFromToken = (token: string) => {
  const [cartId, sig] = token.split(".")
  if (!cartId || !sig || !/^cart_[A-Z0-9]+$/.test(cartId)) return null
  const want = recoveryToken(cartId).split(".")[1]
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? cartId : null
}

type CartRow = {
  id: string
  email?: string | null
  completed_at?: string | null
  updated_at?: string
  currency_code?: string | null
  total?: number | string | null
  customer_id?: string | null
  metadata?: Record<string, unknown> | null
  items?: OrderRow["items"]
  shipping_address?: OrderRow["shipping_address"]
}

const CART_FIELDS = [
  "id",
  "email",
  "completed_at",
  "updated_at",
  "currency_code",
  "total",
  "customer_id",
  "metadata",
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

// Checkouts that got as far as an email address and then stopped, between the wait set in
// Advanced (2 hours by default) and 3 days ago.
export const findAbandonedCarts = async (c: MedusaContainer, afterHours: number) => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const now = Date.now()
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "updated_at", "completed_at", "items.id"],
    filters: { completed_at: null, updated_at: { $lt: new Date(now - afterHours * 3600_000), $gt: new Date(now - 72 * 3600_000) } } as never,
    pagination: { take: 200 },
  })
  return (data as CartRow[]).filter((x) => x.email && !x.completed_at && (x.items ?? []).length)
}

export const trackAbandoned = async (c: MedusaContainer, cartId: string) => {
  const eventId = `abandoned_${cartId}`
  const m = svc(c)
  const [seen] = await m.listMarketingEvents({ event_id: eventId }, { take: 1 })
  if (seen) return []
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  const cart = data[0] as CartRow | undefined
  if (!cart?.email || cart.completed_at || !(cart.items ?? []).length) return []
  // Bought since (in another checkout)? Then it isn't abandoned.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { email: cart.email, created_at: { $gte: new Date(cart.updated_at ?? 0) } } as never,
    pagination: { take: 1 },
  })
  if (orders.length) return []
  // One reminder a day per customer, even with checkouts on several devices.
  const [recent] = await m.listMarketingEvents({ name: "AbandonedCart", customer_hash: customerHash(cart.email), created_at: { $gte: new Date(Date.now() - 24 * 3600_000) } } as never, { take: 1 })
  if (recent) return []
  const s = await loadMarketingSettings(c)
  const ctx = await contextFor(c, cart.id)
  const consent = consentFrom(ctx?.consent, s.consent.mode)
  const asOrder = cart as unknown as OrderRow
  const data2: EventData = {
    value: Number(cart.total ?? 0),
    currency: (cart.currency_code ?? "inr").toUpperCase(),
    items: orderItems(asOrder),
    extra: { cart_id: cart.id, recovery_url: `${storeUrl()}/cart/recover/${recoveryToken(cart.id)}` },
  }
  const event = await recordEvent(c, { event_id: eventId, name: "AbandonedCart", source: "server", customer_hash: customerHash(cart.email), data: data2, consent })
  if (!event) return []
  return queueServerDeliveries(c, {
    event_id: eventId,
    name: "AbandonedCart",
    data: data2,
    consent,
    visitor: visitorFrom(ctx),
    person: personOf({ ...asOrder, email: cart.email }),
    optin: optinFrom(cart.metadata),
    settings: s,
  })
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
