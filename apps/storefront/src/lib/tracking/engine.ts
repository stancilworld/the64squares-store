"use client"

import type { Consent, EventName, MarketingConfig, Platform, TrackData, TrackItem } from "./types"
import { anyTag } from "./types"

// One place for every shop event on the website. track() hands the event to each tag the
// visitor allowed (Meta Pixel, Google Analytics, Google Ads, Tag Manager, Clarity), with the
// same event id everywhere, and reports it to the store's own server, which records it in
// the Event Manager and sends the server copy (Meta Conversions API) with consent.

type W = Window & {
  dataLayer?: unknown[]
  gtag?: (...a: unknown[]) => void
  fbq?: ((...a: unknown[]) => void) & { loaded?: boolean; queue?: unknown[] }
  _fbq?: unknown
  clarity?: ((...a: unknown[]) => void) & { q?: unknown[] }
}
const win = () => window as W

let config: MarketingConfig | null = null
let consent: Consent = { analytics: false, marketing: false }
const started = new Set<string>()

// ------------------------------------------------------------------ loading the tags

export const loadScript = (src: string, timeoutMs = 10_000) =>
  new Promise<boolean>((resolve) => {
    const s = document.createElement("script")
    s.async = true
    s.src = src
    const t = setTimeout(() => resolve(false), timeoutMs)
    s.onload = () => {
      clearTimeout(t)
      resolve(true)
    }
    s.onerror = () => {
      clearTimeout(t)
      resolve(false)
    }
    document.head.appendChild(s)
  })

const gstate = (on: boolean) => (on ? "granted" : "denied")

// Google's tag (Analytics, Ads) and Tag Manager share the dataLayer. Consent Mode v2: the
// visitor's choice is set before anything else runs, and updated when it changes.
const googleBase = () => {
  const w = win()
  if (started.has("google-base")) {
    w.gtag?.("consent", "update", {
      analytics_storage: gstate(consent.analytics),
      ad_storage: gstate(consent.marketing),
      ad_user_data: gstate(consent.marketing),
      ad_personalization: gstate(consent.marketing),
    })
    return
  }
  started.add("google-base")
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- gtag needs the arguments object itself
    w.dataLayer!.push(arguments)
  }
  w.gtag("consent", "default", {
    analytics_storage: gstate(consent.analytics),
    ad_storage: gstate(consent.marketing),
    ad_user_data: gstate(consent.marketing),
    ad_personalization: gstate(consent.marketing),
  })
  w.gtag("js", new Date())
}

const startGoogle = (c: MarketingConfig) => {
  const ga = c.ga4 && consent.analytics
  const ads = c.google_ads && consent.marketing
  const gtm = c.gtm && (consent.analytics || consent.marketing)
  if (!ga && !ads && !gtm) return
  googleBase()
  const w = win()
  if (ga && !started.has("ga4")) {
    started.add("ga4")
    w.gtag!("config", c.ga4!.measurement_id, { send_page_view: false })
  }
  if (ads && !started.has("ads")) {
    started.add("ads")
    w.gtag!("config", c.google_ads!.conversion_id, { allow_enhanced_conversions: c.google_ads!.enhanced_conversions })
  }
  if ((ga || ads) && !started.has("gtag.js")) {
    started.add("gtag.js")
    void loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga ? c.ga4!.measurement_id : c.google_ads!.conversion_id)}`)
  }
  if (gtm && !started.has("gtm")) {
    started.add("gtm")
    w.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" })
    void loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(c.gtm!.container_id)}`)
  }
}

const startMeta = (c: MarketingConfig) => {
  if (!c.meta_pixel || !consent.marketing || started.has("meta")) return
  started.add("meta")
  const w = win()
  if (!w.fbq) {
    const q: unknown[] = []
    const fbq = Object.assign(
      function fbq(...args: unknown[]) {
        const f = w.fbq as unknown as { callMethod?: (...a: unknown[]) => void }
        if (f.callMethod) f.callMethod(...args)
        else q.push(args)
      },
      { queue: q, loaded: true, version: "2.0", push: undefined as unknown }
    )
    fbq.push = fbq
    w.fbq = fbq
    w._fbq = fbq
    void loadScript("https://connect.facebook.net/en_US/fbevents.js")
  }
  w.fbq!("consent", "grant")
  w.fbq!("init", c.meta_pixel.pixel_id)
}

const startClarity = (c: MarketingConfig) => {
  if (!c.clarity || !consent.analytics || started.has("clarity")) return
  started.add("clarity")
  const w = win()
  if (!w.clarity) {
    const q: unknown[] = []
    w.clarity = Object.assign((...args: unknown[]) => void q.push(args), { q })
    void loadScript(`https://www.clarity.ms/tag/${encodeURIComponent(c.clarity.project_id)}`)
  }
  w.clarity!("consentv2", { ad_Storage: gstate(consent.marketing), analytics_Storage: gstate(consent.analytics) })
}

// Events from components that ran before the tracking was set up (the first page of a
// visit: the page's own effects run before the layout's).
const early: [EventName, TrackData][] = []

// Starts (or updates) the tags for the visitor's current choice. Safe to call again.
export const setupTracking = (c: MarketingConfig, choice: Consent) => {
  config = c
  consent = choice
  if (started.has("google-base")) googleBase()
  startGoogle(c)
  startMeta(c)
  startClarity(c)
  captureCampaign()
  keepFbc()
  for (const [name, d] of early.splice(0)) track(name, d)
}

// Meta's click id from an ad link (?fbclid=), kept in the _fbc cookie Meta's own Pixel
// uses, so later events and the order can be matched to the ad. Marketing consent only.
const keepFbc = () => {
  if (!consent.marketing || cookie("_fbc")) return
  const fbclid = new URLSearchParams(location.search).get("fbclid")
  if (!fbclid || !/^[\w.-]{1,400}$/.test(fbclid)) return
  document.cookie = `_fbc=fb.1.${Date.now()}.${fbclid}; path=/; max-age=${90 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
}

// ------------------------------------------------------------------ visit details

const cookie = (name: string) => {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const
let campaign: Record<string, string> | null = null

// The campaign tags of the link the visitor came in on. Kept for the visit, and for 30 days
// once the visitor allows cookies.
const captureCampaign = () => {
  const p = new URLSearchParams(location.search)
  const found = Object.fromEntries(UTM_KEYS.filter((k) => p.get(k)).map((k) => [k, p.get(k)!.slice(0, 200)]))
  if (Object.keys(found).length) campaign = found
  const allowed = consent.analytics || consent.marketing
  try {
    if (allowed && campaign) localStorage.setItem("t64:utm", JSON.stringify({ at: Date.now(), v: campaign }))
    if (!campaign && allowed) {
      const saved = JSON.parse(localStorage.getItem("t64:utm") ?? "null") as { at: number; v: Record<string, string> } | null
      if (saved && Date.now() - saved.at < 30 * 86_400_000) campaign = saved.v
    }
  } catch {}
}

const visitor = () => {
  const fbclid = new URLSearchParams(location.search).get("fbclid")
  return {
    fbp: consent.marketing ? cookie("_fbp") : null,
    fbc: consent.marketing ? cookie("_fbc") || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null) : null,
    ga: consent.analytics ? cookie("_ga") : null,
    page_url: location.href.slice(0, 1000),
  }
}

// ------------------------------------------------------------------ events

const META: Record<EventName, { name: string; custom: boolean }> = {
  PageView: { name: "PageView", custom: false },
  ViewContent: { name: "ViewContent", custom: false },
  Search: { name: "Search", custom: false },
  AddToCart: { name: "AddToCart", custom: false },
  RemoveFromCart: { name: "RemoveFromCart", custom: true },
  ViewCart: { name: "ViewCart", custom: true },
  InitiateCheckout: { name: "InitiateCheckout", custom: false },
  AddPaymentInfo: { name: "AddPaymentInfo", custom: false },
  Purchase: { name: "Purchase", custom: false },
  Lead: { name: "Lead", custom: false },
}

const GA4: Record<EventName, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  RemoveFromCart: "remove_from_cart",
  ViewCart: "view_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
}

const idOf = (i: TrackItem, mode: MarketingConfig["content_id"]) =>
  mode === "sku" ? i.sku || i.variant_id || i.product_id : mode === "variant" ? i.variant_id || i.product_id : i.product_id

const r2 = (n: number) => Math.round(n * 100) / 100

const metaParams = (name: EventName, d: TrackData, mode: MarketingConfig["content_id"]) => {
  const p: Record<string, unknown> = {}
  if (d.currency) p.currency = d.currency.toUpperCase()
  if (typeof d.value === "number") p.value = r2(d.value)
  if (d.items?.length) {
    p.content_type = "product"
    p.content_ids = d.items.map((i) => idOf(i, mode))
    p.contents = d.items.map((i) => ({ id: idOf(i, mode), quantity: i.quantity ?? 1, ...(i.price != null ? { item_price: r2(i.price) } : {}) }))
    p.num_items = d.items.reduce((n, i) => n + (i.quantity ?? 1), 0)
    if (d.items.length === 1 && d.items[0].name) p.content_name = d.items[0].name
  }
  if (name === "Search" && d.search) p.search_string = d.search
  if (d.order_id) p.order_id = d.order_id
  return p
}

const ga4Params = (d: TrackData, mode: MarketingConfig["content_id"]) => {
  const p: Record<string, unknown> = {}
  if (d.currency) p.currency = d.currency.toUpperCase()
  if (typeof d.value === "number") p.value = r2(d.value)
  if (d.order_id) p.transaction_id = d.order_id
  if (d.search) p.search_term = d.search
  if (d.items?.length) {
    p.items = d.items.map((i) => ({
      item_id: idOf(i, mode),
      ...(i.name ? { item_name: i.name } : {}),
      ...(i.variant ? { item_variant: i.variant } : {}),
      ...(i.category ? { item_category: i.category } : {}),
      ...(i.price != null ? { price: r2(i.price) } : {}),
      quantity: i.quantity ?? 1,
    }))
  }
  return p
}

const newId = (name: EventName) => {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`
  return `${name.toLowerCase()}_${rand}`
}

type Outgoing = { event_id: string; name: EventName; page: string; sent: Platform[]; data: Record<string, unknown> }
const outbox: Outgoing[] = []
let timer: ReturnType<typeof setTimeout> | null = null

const flush = () => {
  if (timer) clearTimeout(timer)
  timer = null
  if (!outbox.length) return
  const events = outbox.splice(0, 20)
  const body = JSON.stringify({ consent, visitor: visitor(), utm: campaign, events })
  void fetch("/api/t/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {})
  if (outbox.length) flush()
}

if (typeof window !== "undefined") {
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush()
  })
  addEventListener("pagehide", flush)
}

const excluded = (c: MarketingConfig, p: Platform, name: EventName) => (c.excluded[p] ?? []).includes(name)

// The same event with the same details twice within a second is one event (a component
// that runs its effect twice, a double click).
const recent = new Map<string, number>()
const repeat = (name: EventName, d: TrackData) => {
  const key = `${name}|${d.event_id ?? ""}|${JSON.stringify(d.items ?? null)}|${d.search ?? ""}|${d.value ?? ""}|${name === "PageView" ? location.href : ""}`
  const now = Date.now()
  const last = recent.get(key)
  recent.set(key, now)
  if (recent.size > 200) recent.clear()
  return last !== undefined && now - last < 1000
}

// Sends one shop event to every tag the visitor allowed, and to the store's server.
export const track = (name: EventName, d: TrackData = {}) => {
  const c = config
  if (typeof window === "undefined") return
  if (repeat(name, d)) return
  if (!c) {
    if (early.length < 20) early.push([name, d])
    return
  }
  if (!anyTag(c)) return
  const w = win()
  const eventId = d.event_id ?? newId(name)
  const sent: Platform[] = []

  if (c.meta_pixel && consent.marketing && w.fbq && !excluded(c, "meta_pixel", name)) {
    const m = META[name]
    w.fbq(m.custom ? "trackCustom" : "track", m.name, metaParams(name, d, c.content_id), { eventID: eventId })
    sent.push("meta_pixel")
  }
  if (c.ga4 && consent.analytics && w.gtag && !excluded(c, "ga4", name) && !(name === "Purchase" && c.ga4.purchase_from_server)) {
    const params = name === "PageView" ? { page_location: location.href, page_title: document.title } : ga4Params(d, c.content_id)
    w.gtag("event", GA4[name], { ...params, send_to: c.ga4.measurement_id })
    sent.push("ga4")
  }
  if (c.google_ads && consent.marketing && w.gtag && !excluded(c, "google_ads", name)) {
    const label = name === "Purchase" ? c.google_ads.purchase_label : name === "Lead" ? c.google_ads.lead_label : null
    if (label) {
      if (c.google_ads.enhanced_conversions && d.person && (d.person.email || d.person.phone)) {
        w.gtag("set", "user_data", {
          ...(d.person.email ? { email: d.person.email.trim().toLowerCase() } : {}),
          ...(d.person.phone ? { phone_number: d.person.phone.replace(/[^\d+]/g, "").replace(/^(\d{10})$/, "+91$1") } : {}),
        })
      }
      w.gtag("event", "conversion", {
        send_to: `${c.google_ads.conversion_id}/${label}`,
        ...(typeof d.value === "number" ? { value: r2(d.value), currency: (d.currency ?? "INR").toUpperCase() } : {}),
        ...(d.order_id ? { transaction_id: d.order_id } : {}),
      })
      sent.push("google_ads")
    }
  }
  if (c.gtm && (consent.analytics || consent.marketing) && w.dataLayer && !excluded(c, "gtm", name)) {
    if (name !== "PageView") w.dataLayer.push({ ecommerce: null })
    w.dataLayer.push({ event: GA4[name], event_id: eventId, ...(name === "PageView" ? { page_location: location.href } : { ecommerce: ga4Params(d, c.content_id) }) })
    sent.push("gtm")
  }
  if (c.clarity && consent.analytics && w.clarity && name !== "PageView" && !excluded(c, "clarity", name)) {
    w.clarity("event", name)
    sent.push("clarity")
  }

  outbox.push({
    event_id: eventId,
    name,
    page: location.href.slice(0, 1000),
    sent,
    data: {
      ...(typeof d.value === "number" ? { value: r2(d.value) } : {}),
      ...(d.currency ? { currency: d.currency.toUpperCase() } : {}),
      ...(d.items?.length ? { items: d.items.slice(0, 50) } : {}),
      ...(d.search ? { search: d.search.slice(0, 100) } : {}),
      ...(d.cart_id ? { cart_id: d.cart_id } : {}),
    },
  })
  if (!timer) timer = setTimeout(flush, 500)
}

// Helpers for the shop's components.
export const itemFrom = (p: { product_id: string; variant_id?: string | null; sku?: string | null; name?: string | null; variant?: string | null; price?: number | null; quantity?: number | null }): TrackItem => p
