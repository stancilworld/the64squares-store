import crypto from "node:crypto"
import { decrypt } from "../service-keys"
import {
  type Consent,
  type EventData,
  type OptIn,
  type Person,
  type Visitor,
  apiBase,
  contentIdOf,
  hashed,
  hashedE164,
  hashedMsEmail,
  round2,
  waNumber,
} from "./events"
import { ga4Event, gaClientId, sendToGa4 } from "./ga4"
import { type SendResult, metaEvent, sendToMeta } from "./meta"
import { type EventName, type Integration, type MarketingSettings, type Secrets, type WebhookEndpoint, isExcluded, isLive } from "./settings"

// Every platform this server sends to, in one list. Each one says when it applies, what
// consent it needs, how its payload looks, and how to send it. Adding a platform = adding
// one entry here (and, for a website tag, one block in the website's tracking engine).

export type BuildArgs = {
  name: EventName
  eventId: string
  time: Date
  data: EventData
  visitor: Visitor
  person: Person | null
  consent: Consent
  optin: OptIn | null
  s: MarketingSettings
  k: Secrets
}

export type Sender = {
  platform: string
  integration: Integration | "webhooks"
  // Switched on and tested.
  active: (s: MarketingSettings, k: Secrets) => boolean
  // Why it must not be sent (consent, missing contact details), or null.
  blocked: (a: BuildArgs) => string | null
  build: (a: BuildArgs) => Record<string, unknown> | null
  send: (payload: Record<string, unknown>, s: MarketingSettings, k: Secrets) => Promise<SendResult>
}

const MARKETING = (a: BuildArgs) => (a.consent.marketing ? null : "The visitor did not allow marketing cookies.")
const EMAIL_OPTIN = (a: BuildArgs) =>
  !a.person?.email ? "No email address." : a.optin?.email ? null : "The customer didn't agree to marketing emails."

const ok = (code: number, body?: unknown): SendResult => ({ ok: true, code, retry: false, body })
const fail = (code: number, error: string, retryAfter?: string | null): SendResult => {
  const after = Number(retryAfter)
  return { ok: false, code, error, retry: code === 0 || code === 429 || code >= 500, retryAfterMs: after > 0 ? after * 1000 : undefined }
}
const errText = (body: unknown, fallback: string) => {
  const b = body as Record<string, any> | null
  return (
    b?.error?.message ||
    b?.error?.error_user_msg ||
    b?.message ||
    b?.detail ||
    b?.errors?.[0]?.detail ||
    b?.events?.[0]?.error_message ||
    b?.title ||
    (typeof b?.reason === "string" ? b.reason : null) ||
    fallback
  )
}

// One HTTP call with a 15-second limit; never throws.
export const call = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown }, okWhen?: (status: number, body: any) => boolean): Promise<SendResult> => {
  try {
    const res = await fetch(url, {
      method: init.method ?? "POST",
      headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text.slice(0, 300)
    }
    const good = okWhen ? okWhen(res.status, body) : res.status >= 200 && res.status < 300
    return good ? ok(res.status, body) : fail(res.status, errText(body, `Answer ${res.status}`), res.headers.get("retry-after"))
  } catch (e) {
    return fail(0, `Could not reach the service: ${(e as Error).message}`)
  }
}

const items = (a: BuildArgs) => a.data.items ?? []
const currency = (a: BuildArgs) => (a.data.currency ?? "INR").toUpperCase()

// ------------------------------------------------------------------ Meta Conversions API

const meta: Sender = {
  platform: "meta_capi",
  integration: "meta_capi",
  active: (s, k) => isLive(s, "meta_capi", k) && isLive(s, "meta_pixel", k),
  blocked: MARKETING,
  build: (a) =>
    metaEvent({ name: a.name, eventId: a.eventId, time: a.time, data: a.data, visitor: a.visitor, person: a.person, advanced: a.s.meta_capi.advanced_matching, idMode: a.s.content_id }),
  send: (p, s, k) => sendToMeta(s.meta_pixel.pixel_id, k.meta!, p, s.meta_capi.test_event_code || undefined),
}

// ------------------------------------------------------------------ GA4 Measurement Protocol

const ga4: Sender = {
  platform: "ga4_mp",
  integration: "ga4",
  active: (s, k) => isLive(s, "ga4", k) && s.ga4.server_enabled,
  blocked: (a) => (a.consent.analytics || a.name === "Refund" ? null : "The visitor did not allow analytics cookies."),
  build: (a) =>
    ["Purchase", "Refund", "CompleteRegistration"].includes(a.name)
      ? ga4Event({ name: a.name, data: a.data, idMode: a.s.content_id, time: a.time, clientId: gaClientId(a.visitor.ga_client_id), consent: a.consent })
      : null,
  send: (p, s, k) => sendToGa4(s.ga4.measurement_id, k.ga4!, p),
}

// ------------------------------------------------------------------ Pinterest API for Conversions

export const PINTEREST_NAMES: Partial<Record<EventName, string>> = {
  ViewContent: "page_visit",
  Search: "search",
  AddToCart: "add_to_cart",
  Purchase: "checkout",
  Lead: "lead",
  CompleteRegistration: "signup",
}

const pinterest: Sender = {
  platform: "pinterest_capi",
  integration: "pinterest",
  active: (s, k) => isLive(s, "pinterest", k) && s.pinterest.capi_enabled,
  blocked: MARKETING,
  build: (a) => {
    const n = PINTEREST_NAMES[a.name]
    if (!n) return null
    const ud: Record<string, unknown> = {}
    if (a.visitor.ip) ud.client_ip_address = a.visitor.ip
    if (a.visitor.user_agent) ud.client_user_agent = a.visitor.user_agent
    if (a.visitor.ids?.epik) ud.click_id = a.visitor.ids.epik
    const em = hashed("email", a.person?.email)
    const ph = hashed("phone", a.person?.phone)
    const ext = hashed("email", a.person?.external_id)
    if (em) ud.em = [em]
    if (ph) ud.ph = [ph]
    if (ext) ud.external_id = [ext]
    const cd: Record<string, unknown> = { currency: currency(a) }
    if (typeof a.data.value === "number") cd.value = String(round2(a.data.value))
    if (items(a).length) {
      cd.content_ids = items(a).map((i) => contentIdOf(i, a.s.content_id))
      cd.contents = items(a).map((i) => ({ id: contentIdOf(i, a.s.content_id), item_price: String(round2(i.price ?? 0)), quantity: i.quantity ?? 1, ...(i.name ? { item_name: i.name } : {}) }))
      cd.num_items = items(a).reduce((n, i) => n + (i.quantity ?? 1), 0)
    }
    if (a.data.order_id) cd.order_id = a.data.order_id
    if (a.data.search) cd.search_string = a.data.search
    return {
      event_name: n,
      action_source: "web",
      event_time: Math.floor(a.time.getTime() / 1000),
      event_id: a.eventId,
      ...(a.visitor.page_url ? { event_source_url: a.visitor.page_url } : {}),
      user_data: ud,
      custom_data: cd,
    }
  },
  send: (p, s, k) =>
    call(
      `${apiBase("pinterest", "https://api.pinterest.com")}/v5/ad_accounts/${encodeURIComponent(s.pinterest.ad_account_id)}/events${s.pinterest.test_mode ? "?test=true" : ""}`,
      { headers: { authorization: `Bearer ${k.pinterest}` }, body: { data: [p] } },
      (st, b) => st >= 200 && st < 300 && (b?.num_events_received ?? 0) >= 1 && b?.events?.[0]?.status !== "failed"
    ),
}

// ------------------------------------------------------------------ Snapchat Conversions API (v3)

export const SNAP_NAMES: Partial<Record<EventName, string>> = {
  PageView: "PAGE_VIEW",
  ViewContent: "VIEW_CONTENT",
  Search: "SEARCH",
  AddToCart: "ADD_CART",
  InitiateCheckout: "START_CHECKOUT",
  AddPaymentInfo: "ADD_BILLING",
  Purchase: "PURCHASE",
  CompleteRegistration: "SIGN_UP",
}

const snapchat: Sender = {
  platform: "snap_capi",
  integration: "snapchat",
  active: (s, k) => isLive(s, "snapchat", k) && s.snapchat.capi_enabled,
  blocked: MARKETING,
  build: (a) => {
    const n = SNAP_NAMES[a.name]
    if (!n) return null
    const ud: Record<string, unknown> = {}
    const em = hashed("email", a.person?.email)
    const ph = hashed("phone", a.person?.phone)
    if (em) ud.em = [em]
    if (ph) ud.ph = [ph]
    if (a.visitor.ip) ud.client_ip_address = a.visitor.ip
    if (a.visitor.user_agent) ud.client_user_agent = a.visitor.user_agent
    if (a.visitor.ids?.sc_click_id) ud.sc_click_id = a.visitor.ids.sc_click_id
    if (a.visitor.ids?.scid) ud.sc_cookie1 = a.visitor.ids.scid
    const cd: Record<string, unknown> = { currency: currency(a) }
    if (typeof a.data.value === "number") cd.value = round2(a.data.value)
    if (items(a).length) {
      cd.content_ids = items(a).map((i) => contentIdOf(i, a.s.content_id))
      cd.contents = items(a).map((i) => ({ id: contentIdOf(i, a.s.content_id), quantity: i.quantity ?? 1, item_price: round2(i.price ?? 0) }))
      cd.num_items = items(a).reduce((x, i) => x + (i.quantity ?? 1), 0)
    }
    // For purchases Snap also matches the Pixel's transaction_id with order_id.
    if (a.data.order_id) cd.order_id = a.data.order_id
    if (a.data.search) cd.search_string = a.data.search
    return {
      event_name: n,
      event_time: Math.floor(a.time.getTime() / 1000),
      event_id: a.eventId,
      action_source: "WEB",
      ...(a.visitor.page_url ? { event_source_url: a.visitor.page_url } : {}),
      user_data: ud,
      custom_data: cd,
    }
  },
  send: (p, s, k) =>
    call(
      `${apiBase("snap", "https://tr.snapchat.com")}/v3/${encodeURIComponent(s.snapchat.pixel_id)}/events?access_token=${encodeURIComponent(k.snapchat!)}`,
      { body: { data: [p] } },
      (st, b) => st >= 200 && st < 300 && b?.status !== "INVALID"
    ),
}

// ------------------------------------------------------------------ Microsoft Advertising Conversions API

export const UET_NAMES: Partial<Record<EventName, string>> = {
  ViewContent: "view_item",
  Search: "search",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
  CompleteRegistration: "sign_up",
}
const UET_PAGE: Partial<Record<EventName, string>> = { ViewContent: "product", Search: "searchresults", AddToCart: "cart", ViewCart: "cart", Purchase: "purchase" }

const microsoft: Sender = {
  platform: "uet_capi",
  integration: "microsoft_ads",
  active: (s, k) => isLive(s, "microsoft_ads", k) && s.microsoft_ads.capi_enabled,
  blocked: (a) => {
    if (!a.consent.marketing) return "The visitor did not allow marketing cookies."
    const hasId = !!(a.person?.email || a.person?.phone || a.visitor.ids?.msclkid)
    return hasId ? null : "Microsoft needs an email, phone or Microsoft click id, and this visit had none."
  },
  build: (a) => {
    const n = UET_NAMES[a.name]
    const page = a.name === "PageView"
    if (!n && !page) return null
    const ud: Record<string, unknown> = {}
    const em = hashedMsEmail(a.person?.email)
    const ph = hashedE164(a.person?.phone)
    if (em) ud.em = em
    if (ph) ud.ph = ph
    if (a.visitor.ip) ud.clientIpAddress = a.visitor.ip
    if (a.visitor.user_agent) ud.clientUserAgent = a.visitor.user_agent
    if (a.visitor.ids?.msclkid) ud.msclkid = a.visitor.ids.msclkid
    const cd: Record<string, unknown> = {}
    if (!page && typeof a.data.value === "number") {
      cd.value = round2(a.data.value)
      cd.currency = currency(a)
      cd.ecommTotalValue = round2(a.data.value)
    }
    if (a.data.order_id) cd.transactionId = a.data.order_id
    if (items(a).length) cd.itemIds = items(a).map((i) => contentIdOf(i, a.s.content_id))
    if (UET_PAGE[a.name]) cd.pageType = UET_PAGE[a.name]
    return {
      eventType: page ? "pageLoad" : "custom",
      eventId: a.eventId,
      ...(n ? { eventName: n } : {}),
      eventTime: Math.floor(a.time.getTime() / 1000),
      ...(a.visitor.page_url ? { eventSourceUrl: a.visitor.page_url } : {}),
      adStorageConsent: "G",
      userData: ud,
      ...(Object.keys(cd).length ? { customData: cd } : {}),
    }
  },
  send: (p, s, k) =>
    call(`${apiBase("uet", "https://capi.uet.microsoft.com")}/v1/${encodeURIComponent(s.microsoft_ads.tag_id)}/events`, {
      headers: { authorization: `Bearer ${k.microsoft}` },
      body: { data: [p], dataProvider: "the64squares" },
    }),
}

// ------------------------------------------------------------------ LinkedIn Conversions API

export const LINKEDIN_VERSION = "202609"

const linkedin: Sender = {
  platform: "linkedin_capi",
  integration: "linkedin",
  active: (s, k) => isLive(s, "linkedin", k) && s.linkedin.capi_enabled,
  blocked: (a) => {
    if (!a.consent.marketing) return "The visitor did not allow marketing cookies."
    const has = !!(a.person?.email || a.visitor.ids?.li_fat_id || a.visitor.ip)
    return has ? null : "LinkedIn needs an email, LinkedIn's click id or the IP address."
  },
  build: (a) => {
    const rule = a.name === "Purchase" ? a.s.linkedin.purchase_conversion_id : a.name === "Lead" ? a.s.linkedin.lead_conversion_id : ""
    if (!rule) return null
    const ids: { idType: string; idValue: string }[] = []
    const em = hashed("email", a.person?.email)
    if (em) ids.push({ idType: "SHA256_EMAIL", idValue: em })
    if (a.visitor.ids?.li_fat_id) ids.push({ idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: a.visitor.ids.li_fat_id })
    if (a.visitor.ip) ids.push({ idType: "PLAINTEXT_IP_ADDRESS", idValue: a.visitor.ip })
    const info = a.person?.first_name && a.person?.last_name ? { firstName: a.person.first_name, lastName: a.person.last_name, ...(a.person.country ? { countryCode: a.person.country.toUpperCase() } : {}) } : null
    return {
      conversion: `urn:lla:llaPartnerConversion:${rule}`,
      conversionHappenedAt: a.time.getTime(),
      ...(typeof a.data.value === "number" && a.data.value > 0 ? { conversionValue: { currencyCode: currency(a), amount: String(round2(a.data.value)) } } : {}),
      user: { userIds: ids, ...(info ? { userInfo: info } : {}) },
      eventId: a.eventId,
    }
  },
  send: (p, _s, k) =>
    call(`${apiBase("linkedin", "https://api.linkedin.com")}/rest/conversionEvents`, {
      headers: { authorization: `Bearer ${k.linkedin}`, "Linkedin-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" },
      body: p,
    }),
}

// ------------------------------------------------------------------ WhatsApp (Cloud API)

export const WA_API_VERSION = "v25.0"

// Template body variables, in order (documented in the admin):
//   order:     {{1}} first name, {{2}} order number, {{3}} total
//   shipped:   {{1}} first name, {{2}} order number, {{3}} tracking number or link
//   abandoned: {{1}} first name, {{2}} link back to the cart
const whatsapp: Sender = {
  platform: "whatsapp",
  integration: "whatsapp",
  active: (s, k) => isLive(s, "whatsapp", k),
  blocked: (a) => (!waNumber(a.person?.phone) ? "No mobile number." : a.optin?.whatsapp ? null : "The customer didn't ask for WhatsApp messages."),
  build: (a) => {
    const t = a.name === "Purchase" ? a.s.whatsapp.template_order : a.name === "OrderShipped" ? a.s.whatsapp.template_shipped : a.name === "AbandonedCart" ? a.s.whatsapp.template_abandoned : ""
    if (!t) return null
    const x = a.data.extra ?? {}
    const name = a.person?.first_name?.trim() || "there"
    const money = typeof a.data.value === "number" ? `₹${a.data.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""
    const vars =
      a.name === "Purchase"
        ? [name, `#${x.display_id ?? ""}`, money]
        : a.name === "OrderShipped"
          ? [name, `#${x.display_id ?? ""}`, String(x.tracking_url || x.tracking_number || "—")]
          : [name, String(x.recovery_url ?? "")]
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waNumber(a.person?.phone),
      type: "template",
      template: {
        name: t,
        language: { policy: "deterministic", code: a.s.whatsapp.language },
        components: [{ type: "body", parameters: vars.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }],
      },
    }
  },
  send: (p, s, k) =>
    call(`${apiBase("meta", "https://graph.facebook.com")}/${WA_API_VERSION}/${encodeURIComponent(s.whatsapp.phone_number_id)}/messages`, {
      headers: { authorization: `Bearer ${k.whatsapp}` },
      body: p,
    }),
}

// ------------------------------------------------------------------ Brevo

const BREVO_EVENTS: Partial<Record<EventName, string>> = { Purchase: "order_placed", AbandonedCart: "cart_abandoned", OrderShipped: "order_shipped", Subscribe: "subscribed" }

const brevo: Sender = {
  platform: "brevo",
  integration: "brevo",
  active: (s, k) => isLive(s, "brevo", k),
  blocked: EMAIL_OPTIN,
  build: (a) => {
    const ev = BREVO_EVENTS[a.name]
    if (!ev || !a.person?.email) return null
    const email = a.person.email.trim().toLowerCase()
    const x = a.data.extra ?? {}
    const attrs: Record<string, string> = {}
    if (a.person.first_name) attrs.FIRSTNAME = a.person.first_name
    if (a.person.last_name) attrs.LASTNAME = a.person.last_name
    return {
      contact: { email, attributes: attrs, listIds: [Number(a.s.brevo.list_id)], updateEnabled: true },
      event: {
        event_name: ev,
        event_date: a.time.toISOString(),
        identifiers: { email_id: email },
        event_properties: {
          ...(a.data.order_id ? { order_id: a.data.order_id, order_number: x.display_id ?? null } : {}),
          ...(typeof a.data.value === "number" ? { value: round2(a.data.value), currency: currency(a) } : {}),
          ...(items(a).length ? { items: items(a).map((i) => ({ id: contentIdOf(i, a.s.content_id), name: i.name ?? "", price: i.price ?? 0, quantity: i.quantity ?? 1 })) } : {}),
          ...(x.recovery_url ? { cart_url: x.recovery_url } : {}),
          ...(x.tracking_url ? { tracking_url: x.tracking_url } : {}),
        },
      },
    }
  },
  send: async (p, _s, k) => {
    const base = apiBase("brevo", "https://api.brevo.com")
    const headers = { "api-key": k.brevo!, accept: "application/json" }
    const c = await call(`${base}/v3/contacts`, { headers, body: p.contact })
    if (!c.ok) return c
    return call(`${base}/v3/events`, { headers, body: p.event })
  },
}

// ------------------------------------------------------------------ Mailchimp

export const mailchimpBase = (key: string) => {
  const dc = key.split("-").pop()
  return apiBase("mailchimp", `https://${dc}.api.mailchimp.com`)
}

const mailchimp: Sender = {
  platform: "mailchimp",
  integration: "mailchimp",
  active: (s, k) => isLive(s, "mailchimp", k),
  blocked: EMAIL_OPTIN,
  build: (a) => {
    if (!["Subscribe", "Purchase", "AbandonedCart"].includes(a.name) || !a.person?.email) return null
    const email = a.person.email.trim().toLowerCase()
    const x = a.data.extra ?? {}
    const merge: Record<string, string> = {}
    if (a.person.first_name) merge.FNAME = a.person.first_name
    if (a.person.last_name) merge.LNAME = a.person.last_name
    // Tags drive Mailchimp customer journeys: "abandoned-cart" starts a reminder journey and
    // is removed when the customer buys.
    const tags =
      a.name === "Subscribe"
        ? [{ name: "newsletter", status: "active" }]
        : a.name === "Purchase"
          ? [
              { name: "customer", status: "active" },
              { name: "abandoned-cart", status: "inactive" },
            ]
          : [{ name: "abandoned-cart", status: "active" }]
    return {
      hash: crypto.createHash("md5").update(email).digest("hex"),
      member: { email_address: email, status_if_new: "subscribed", merge_fields: merge },
      cart_url: a.name === "AbandonedCart" ? (x.recovery_url ?? null) : null,
      tags,
    }
  },
  send: async (p, s, k) => {
    const base = `${mailchimpBase(k.mailchimp!)}/3.0/lists/${encodeURIComponent(s.mailchimp.audience_id)}/members/${p.hash}`
    const headers = { authorization: `Bearer ${k.mailchimp}` }
    const member = p.member as Record<string, any>
    // The cart link goes in a CARTURL merge field when the audience has one.
    const withUrl = p.cart_url ? { ...member, merge_fields: { ...member.merge_fields, CARTURL: p.cart_url } } : member
    let r = await call(`${base}?skip_merge_validation=true`, { method: "PUT", headers, body: withUrl })
    if (!r.ok && p.cart_url && /merge/i.test(r.error ?? "")) r = await call(`${base}?skip_merge_validation=true`, { method: "PUT", headers, body: member })
    if (!r.ok) return r
    return call(`${base}/tags`, { headers, body: { tags: p.tags } })
  },
}

// ------------------------------------------------------------------ Klaviyo

export const KLAVIYO_REVISION = "2025-10-15"
const KLAVIYO_METRICS: Partial<Record<EventName, string>> = { Purchase: "Placed Order", AbandonedCart: "Abandoned Cart", OrderShipped: "Fulfilled Order" }

const klaviyoHeaders = (key: string) => ({ authorization: `Klaviyo-API-Key ${key}`, revision: KLAVIYO_REVISION, accept: "application/vnd.api+json" })

const klaviyo: Sender = {
  platform: "klaviyo",
  integration: "klaviyo",
  active: (s, k) => isLive(s, "klaviyo", k),
  blocked: EMAIL_OPTIN,
  build: (a) => {
    if (!a.person?.email) return null
    const email = a.person.email.trim().toLowerCase()
    const profile = { email, ...(a.person.first_name ? { first_name: a.person.first_name } : {}), ...(a.person.last_name ? { last_name: a.person.last_name } : {}) }
    if (a.name === "Subscribe") {
      return {
        kind: "subscribe",
        body: {
          data: {
            type: "profile-subscription-bulk-create-job",
            attributes: {
              profiles: { data: [{ type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } } } }] },
              historical_import: false,
            },
            relationships: { list: { data: { type: "list", id: a.s.klaviyo.list_id } } },
          },
        },
      }
    }
    const metric = KLAVIYO_METRICS[a.name]
    if (!metric) return null
    const x = a.data.extra ?? {}
    return {
      kind: "event",
      body: {
        data: {
          type: "event",
          attributes: {
            properties: {
              ...(a.data.order_id ? { OrderId: a.data.order_id, OrderNumber: x.display_id ?? null } : {}),
              ...(items(a).length ? { Items: items(a).map((i) => ({ ProductID: contentIdOf(i, a.s.content_id), ProductName: i.name ?? "", Quantity: i.quantity ?? 1, ItemPrice: i.price ?? 0 })) } : {}),
              ...(x.recovery_url ? { CheckoutURL: x.recovery_url } : {}),
              ...(x.tracking_url ? { TrackingURL: x.tracking_url } : {}),
            },
            time: a.time.toISOString(),
            ...(typeof a.data.value === "number" ? { value: round2(a.data.value), value_currency: currency(a) } : {}),
            unique_id: a.eventId,
            metric: { data: { type: "metric", attributes: { name: metric } } },
            profile: { data: { type: "profile", attributes: profile } },
          },
        },
      },
    }
  },
  send: (p, _s, k) => {
    const base = apiBase("klaviyo", "https://a.klaviyo.com")
    const path = p.kind === "subscribe" ? "/api/profile-subscription-bulk-create-jobs" : "/api/events"
    return call(`${base}${path}`, { headers: { ...klaviyoHeaders(k.klaviyo!), "content-type": "application/vnd.api+json" }, body: p.body })
  },
}
export { klaviyoHeaders }

// ------------------------------------------------------------------ webhooks

// Signature: X-T64-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the
// endpoint's secret>. Receivers should check it and refuse anything older than 5 minutes.
export const signWebhook = (secret: string, body: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`

export const webhookSender = (ep: WebhookEndpoint): Sender => ({
  platform: `webhook_${ep.id}`,
  integration: "webhooks",
  active: () => ep.enabled,
  blocked: () => null,
  build: (a) => {
    if (!ep.events.includes(a.name)) return null
    const p = a.person
    return {
      id: a.eventId,
      type: a.name,
      created_at: a.time.toISOString(),
      data: {
        ...(a.data.order_id ? { order_id: a.data.order_id } : {}),
        ...(typeof a.data.value === "number" ? { value: round2(a.data.value), currency: currency(a) } : {}),
        ...(items(a).length ? { items: items(a) } : {}),
        ...(a.data.search ? { search: a.data.search } : {}),
        ...(a.data.extra ? a.data.extra : {}),
        ...(a.data.utm ? { utm: a.data.utm } : {}),
        ...(p ? { customer: { email: p.email ?? null, phone: p.phone ?? null, first_name: p.first_name ?? null, last_name: p.last_name ?? null } } : {}),
        ...(a.optin ? { opt_in: a.optin } : {}),
        consent: a.consent,
      },
    }
  },
  send: async (p) => {
    const secret = decrypt(ep.secret_enc)
    if (!secret) return fail(400, "The webhook's signing secret can't be read. Make a new one.")
    const body = JSON.stringify(p)
    return call(ep.url, {
      headers: { "x-t64-signature": signWebhook(secret, body), "x-t64-event": String(p.type), "x-t64-event-id": String(p.id), "user-agent": "The64Squares-Webhooks/1.0" },
      body,
    })
  },
})

export const STATIC_SENDERS: Sender[] = [meta, ga4, pinterest, snapchat, microsoft, linkedin, whatsapp, brevo, mailchimp, klaviyo]

// The senders that apply now: switched-on platforms and enabled webhook endpoints.
export const sendersFor = (s: MarketingSettings, k: Secrets) => [
  ...STATIC_SENDERS.filter((x) => x.active(s, k)),
  ...s.webhooks.endpoints.filter((e) => e.enabled).map(webhookSender),
]

export const senderByPlatform = (s: MarketingSettings, platform: string) =>
  STATIC_SENDERS.find((x) => x.platform === platform) ?? (() => {
    const ep = s.webhooks.endpoints.find((e) => `webhook_${e.id}` === platform)
    return ep ? webhookSender(ep) : null
  })()

export const excludedFor = (s: MarketingSettings, platform: string, name: EventName) =>
  platform.startsWith("webhook_") ? false : isExcluded(s, platform as never, name)
