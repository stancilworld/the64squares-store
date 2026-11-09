import type { MedusaContainer } from "@medusajs/framework/types"
import { MARKETING_MODULE } from "../../modules/marketing"
import type MarketingModuleService from "../../modules/marketing/service"
import { addBrowserDeliveries, queueServerDeliveries, recordEvent, secretsOf } from "./engine"
import type { Consent, EventData, Visitor } from "./events"
import { type EventName, type Integration, type Platform, PLATFORMS, SERVER_EVENTS, isExcluded, isLive, loadMarketingSettings } from "./settings"

// Events reported by the website (the browser), after validation (CollectBody in
// api/admin/validators.ts) and the per-address limit in the route.

export type CollectedEvent = {
  event_id: string
  name: EventName
  page?: string | null
  sent: Platform[]
  data: EventData & { cart_id?: string | null }
}

export type CollectInput = {
  consent: Consent
  visitor: { fbp?: string | null; fbc?: string | null; ga?: string | null; page_url?: string | null }
  utm?: Record<string, string> | null
  events: CollectedEvent[]
  ip: string | null
  user_agent: string | null
}

const BROWSER_INTEGRATION: Partial<Record<Platform, Integration>> = { meta_pixel: "meta_pixel", ga4: "ga4", google_ads: "google_ads", gtm: "gtm", clarity: "clarity" }
const CONTEXT_EVENTS: EventName[] = ["InitiateCheckout", "AddPaymentInfo"]

// Only the path of the page is kept with the event; campaign tags are kept on their own.
const pathOf = (url: string | null | undefined) => {
  if (!url) return null
  try {
    return new URL(url, "https://x.invalid").pathname.slice(0, 300)
  } catch {
    return null
  }
}

// A page address without its query (no emails or codes in links reach the platforms).
const cleanUrl = (url: string | null | undefined) => {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

export const collect = async (c: MedusaContainer, input: CollectInput) => {
  const s = await loadMarketingSettings(c)
  const secrets = await secretsOf(c)
  const m: MarketingModuleService = c.resolve(MARKETING_MODULE)
  const queued: string[] = []
  let accepted = 0

  for (const e of input.events) {
    // Tags that really ran for this event: switched on and allowed.
    const sent = e.sent.filter((p) => {
      const i = BROWSER_INTEGRATION[p]
      return !!i && isLive(s, i, secrets) && !isExcluded(s, p, e.name)
    })

    if (SERVER_EVENTS.includes(e.name)) {
      // The store makes these itself. The website only reports which tags also fired
      // for an order it already recorded.
      if (e.name !== "Purchase" || !/^purchase_order_[A-Z0-9]+$/.test(e.event_id)) continue
      const [ev] = await m.listMarketingEvents({ event_id: e.event_id }, { take: 1 })
      if (ev) await addBrowserDeliveries(c, { event_id: ev.event_id, name: ev.name, order_id: ev.order_id }, sent)
      continue
    }

    const data: EventData = { ...e.data, utm: input.utm ?? null }
    const event = await recordEvent(c, { event_id: e.event_id, name: e.name, source: "browser", page: pathOf(e.page ?? input.visitor.page_url), data, consent: input.consent })
    if (!event) continue
    accepted++
    await addBrowserDeliveries(c, { event_id: e.event_id, name: e.name }, sent)

    const visitor: Visitor = {
      ip: input.ip,
      user_agent: input.user_agent,
      fbp: input.visitor.fbp,
      fbc: input.visitor.fbc,
      ga_client_id: input.visitor.ga,
      page_url: cleanUrl(e.page ?? input.visitor.page_url),
    }
    queued.push(...(await queueServerDeliveries(c, { event_id: e.event_id, name: e.name, data, consent: input.consent, visitor, person: null, settings: s })))

    // Checkout started: remember the visit, so the purchase can be matched to it later.
    const cartId = e.data.cart_id
    if (cartId && CONTEXT_EVENTS.includes(e.name)) {
      // Only what the visitor allowed: Meta's ids, IP address and browser with marketing
      // consent; Google's id with analytics consent.
      const mk = input.consent.marketing
      const row = {
        cart_id: cartId,
        fbp: mk ? (input.visitor.fbp ?? null) : null,
        fbc: mk ? (input.visitor.fbc ?? null) : null,
        ga_client_id: input.consent.analytics ? (input.visitor.ga ?? null) : null,
        ip: mk ? input.ip : null,
        user_agent: mk ? input.user_agent : null,
        page: cleanUrl(input.visitor.page_url),
        consent: input.consent as unknown as Record<string, unknown>,
        utm: (input.utm ?? null) as Record<string, unknown> | null,
      }
      const [ctx] = await m.listMarketingContexts({ cart_id: cartId }, { take: 1 })
      if (ctx) await m.updateMarketingContexts({ id: ctx.id, ...row })
      else await m.createMarketingContexts(row).catch(() => {})
    }
  }
  return { accepted, queued }
}

export const isBrowserPlatform = (p: string): p is Platform => p in PLATFORMS && PLATFORMS[p as Platform].channel === "browser"
