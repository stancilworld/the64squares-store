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
  pintrk?: ((...a: unknown[]) => void) & { queue?: unknown[]; version?: string }
  snaptr?: ((...a: unknown[]) => void) & { queue?: unknown[] }
  uetq?: unknown[] & { push: (...a: unknown[]) => void }
  lintrk?: ((...a: unknown[]) => void) & { q?: unknown[] }
  _linkedin_partner_id?: string
  _linkedin_data_partner_ids?: string[]
  UET?: new (o: Record<string, unknown>) => unknown[]
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

// Pinterest Tag (https://developers.pinterest.com/docs/api-features/pinterest-tag/).
const startPinterest = (c: MarketingConfig) => {
  if (!c.pinterest || !consent.marketing || started.has("pinterest")) return
  started.add("pinterest")
  const w = win()
  if (!w.pintrk) {
    const q: unknown[] = []
    w.pintrk = Object.assign((...args: unknown[]) => void q.push(args), { queue: q, version: "3.0" })
    void loadScript("https://s.pinimg.com/ct/core.js")
  }
  w.pintrk!("load", c.pinterest.tag_id)
}

// Snap Pixel.
const startSnap = (c: MarketingConfig) => {
  if (!c.snapchat || !consent.marketing || started.has("snap")) return
  started.add("snap")
  const w = win()
  if (!w.snaptr) {
    const q: unknown[] = []
    const f = Object.assign(
      function snaptr(...args: unknown[]) {
        const h = (w.snaptr as unknown as { handleRequest?: (...a: unknown[]) => void }).handleRequest
        if (h) h(...args)
        else q.push(args)
      },
      { queue: q }
    )
    w.snaptr = f
    void loadScript("https://sc-static.net/scevent.min.js")
  }
  w.snaptr!("init", c.snapchat.pixel_id, {})
}

// Microsoft UET (Bing ads). It counts page changes inside the site itself.
const startUet = (c: MarketingConfig) => {
  if (!c.microsoft_ads || !consent.marketing || started.has("uet")) return
  started.add("uet")
  const w = win()
  const queued = (w.uetq as unknown[] | undefined) ?? []
  w.uetq = queued as W["uetq"]
  w.uetq!.push("consent", "default", { ad_storage: "granted" })
  void loadScript("https://bat.bing.com/bat.js").then((ok) => {
    if (!ok || !w.UET) return
    const uet = new w.UET({ ti: c.microsoft_ads!.tag_id, enableAutoSpaTracking: true, q: w.uetq })
    w.uetq = uet as W["uetq"]
    w.uetq!.push("pageLoad")
  })
}

// LinkedIn Insight Tag.
const startLinkedIn = (c: MarketingConfig) => {
  if (!c.linkedin || !consent.marketing || started.has("linkedin")) return
  started.add("linkedin")
  const w = win()
  w._linkedin_partner_id = c.linkedin.partner_id
  w._linkedin_data_partner_ids = [...(w._linkedin_data_partner_ids ?? []), c.linkedin.partner_id]
  if (!w.lintrk) {
    const q: unknown[] = []
    w.lintrk = Object.assign((a: unknown, b: unknown) => void q.push([a, b]), { q })
  }
  void loadScript("https://snap.licdn.com/li.lms-analytics/insight.min.js")
}

// Starts (or updates) the tags for the visitor's current choice. Safe to call again.
export const setupTracking = (c: MarketingConfig, choice: Consent) => {
  config = c
  consent = choice
  if (started.has("google-base")) googleBase()
  startGoogle(c)
  startMeta(c)
  startClarity(c)
  startPinterest(c)
  startSnap(c)
  startUet(c)
  startLinkedIn(c)
  captureCampaign()
  keepFbc()
  keepClickIds()
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

// Click ids from ad links (?ScCid= Snapchat, ?msclkid= Microsoft, ?li_fat_id= LinkedIn, ?epik= Pinterest), kept for 30 days
// with marketing consent, so the order can be credited to the ad.
const keepClickIds = () => {
  if (!consent.marketing) return
  const p = new URLSearchParams(location.search)
  for (const [param, name] of [
    ["ScCid", "t64_sccid"],
    ["msclkid", "t64_msclkid"],
    ["li_fat_id", "t64_lifat"],
    ["epik", "t64_epik"],
  ] as const) {
    const v = p.get(param)
    if (v && /^[\w.:-]{1,200}$/.test(v)) document.cookie = `${name}=${v}; path=/; max-age=${30 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
  }
}

const clean = (v: string | null) => (v && /^[\w.:-]{1,300}$/.test(v) ? v : null)

const clickIds = () => {
  if (!consent.marketing) return null
  const ids = {
    li_fat_id: clean(cookie("li_fat_id") || cookie("t64_lifat")),
    scid: clean(cookie("_scid")),
    sc_click_id: clean(cookie("t64_sccid")),
    msclkid: clean(cookie("t64_msclkid") || (cookie("_uetmsclkid") ?? "").replace(/^_uet/, "") || null),
    epik: clean(cookie("_epik") || cookie("t64_epik")),
  }
  const set = Object.fromEntries(Object.entries(ids).filter(([, v]) => v))
  return Object.keys(set).length ? set : null
}

const visitor = () => {
  const fbclid = new URLSearchParams(location.search).get("fbclid")
  return {
    fbp: consent.marketing ? cookie("_fbp") : null,
    fbc: consent.marketing ? cookie("_fbc") || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null) : null,
    ga: consent.analytics ? cookie("_ga") : null,
    page_url: location.href.slice(0, 1000),
    ids: clickIds(),
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

// Event names on the other ad platforms (null/absent: not sent there).
const PINTEREST: Partial<Record<EventName, string>> = { ViewContent: "pagevisit", Search: "search", AddToCart: "addtocart", Purchase: "checkout", Lead: "lead" }
const SNAP: Partial<Record<EventName, string>> = {
  PageView: "PAGE_VIEW",
  ViewContent: "VIEW_CONTENT",
  Search: "SEARCH",
  AddToCart: "ADD_CART",
  InitiateCheckout: "START_CHECKOUT",
  AddPaymentInfo: "ADD_BILLING",
  Purchase: "PURCHASE",
}
const UET: Partial<Record<EventName, string>> = {
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
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
  if (consent.marketing) {
    const lines = (d.items ?? []).map((i) => ({ product_id: idOf(i, c.content_id), product_name: i.name ?? undefined, product_price: i.price ?? undefined, product_quantity: i.quantity ?? 1 }))
    const qty = (d.items ?? []).reduce((n, i) => n + (i.quantity ?? 1), 0)
    // Pinterest
    if (c.pinterest && w.pintrk && !excluded(c, "pinterest_tag", name)) {
      const pin = PINTEREST[name]
      if (name === "PageView") {
        w.pintrk("page")
        sent.push("pinterest_tag")
      } else if (pin) {
        w.pintrk("track", pin, {
          event_id: eventId,
          ...(typeof d.value === "number" ? { value: r2(d.value), currency: (d.currency ?? "INR").toUpperCase() } : {}),
          ...(qty ? { order_quantity: qty, line_items: lines } : {}),
          ...(d.order_id ? { order_id: d.order_id } : {}),
          ...(d.search ? { search_query: d.search } : {}),
        })
        sent.push("pinterest_tag")
      }
    }
    // Snapchat: client_dedup_id matches the server copy's event_id; transaction_id the order.
    if (c.snapchat && w.snaptr && !excluded(c, "snap_pixel", name) && SNAP[name]) {
      w.snaptr("track", SNAP[name], {
        client_dedup_id: eventId,
        ...(typeof d.value === "number" ? { price: r2(d.value), currency: (d.currency ?? "INR").toUpperCase() } : {}),
        ...(d.items?.length ? { item_ids: d.items.map((i) => idOf(i, c.content_id)), number_items: qty } : {}),
        ...(d.order_id ? { transaction_id: d.order_id } : {}),
        ...(d.search ? { search_string: d.search } : {}),
      })
      sent.push("snap_pixel")
    }
    // Microsoft UET (page views are counted by the tag itself).
    if (c.microsoft_ads && w.uetq && name !== "PageView" && !excluded(c, "uet", name) && UET[name]) {
      w.uetq.push("event", UET[name], {
        event_id: eventId,
        ...(typeof d.value === "number" ? { revenue_value: r2(d.value), currency: (d.currency ?? "INR").toUpperCase(), ecomm_totalvalue: r2(d.value) } : {}),
        ...(d.items?.length ? { ecomm_prodid: d.items.map((i) => idOf(i, c.content_id)) } : {}),
        ...(d.order_id ? { transaction_id: d.order_id } : {}),
        ...(d.search ? { search_term: d.search } : {}),
      })
      sent.push("uet")
    }
    // LinkedIn: only the conversions set in the admin (order, lead).
    const li = c.linkedin ? (name === "Purchase" ? c.linkedin.purchase_conversion_id : name === "Lead" ? c.linkedin.lead_conversion_id : null) : null
    if (li && w.lintrk && !excluded(c, "linkedin_tag", name)) {
      w.lintrk("track", { conversion_id: Number(li), event_id: eventId })
      sent.push("linkedin_tag")
    }
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
