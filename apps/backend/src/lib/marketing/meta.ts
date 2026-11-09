import { type EventData, type EventItem, type Person, type Visitor, META_NAMES, apiBase, contentIdOf, hashed, round2 } from "./events"
import type { EventName } from "./settings"

// Meta Conversions API: https://developers.facebook.com/docs/marketing-api/conversions-api
export const META_API_VERSION = "v25.0"
export const metaBase = () => apiBase("meta", "https://graph.facebook.com")

const customData = (name: EventName, d: EventData, idMode: "variant" | "product" | "sku") => {
  const items = d.items ?? []
  const out: Record<string, unknown> = {}
  if (d.currency) out.currency = d.currency.toUpperCase()
  if (typeof d.value === "number") out.value = round2(d.value)
  if (items.length) {
    out.content_type = "product"
    out.content_ids = items.map((i) => contentIdOf(i, idMode))
    out.contents = items.map((i: EventItem) => ({ id: contentIdOf(i, idMode), quantity: i.quantity ?? 1, ...(i.price != null ? { item_price: round2(i.price) } : {}) }))
    out.num_items = items.reduce((n, i) => n + (i.quantity ?? 1), 0)
    if (items.length === 1 && items[0].name) out.content_name = items[0].name
  }
  if (name === "Search" && d.search) out.search_string = d.search
  if (d.order_id) out.order_id = d.order_id
  return out
}

// The customer details Meta matches on. Contact details are hashed; the IP address,
// browser and Meta's own cookies are sent as they are (that's what Meta asks for).
export const metaUserData = (v: Visitor, p: Person | null, advanced: boolean) => {
  const u: Record<string, unknown> = {}
  if (v.ip) u.client_ip_address = v.ip
  if (v.user_agent) u.client_user_agent = v.user_agent
  if (v.fbp) u.fbp = v.fbp
  if (v.fbc) u.fbc = v.fbc
  if (p && advanced) {
    const add = (k: string, val: string | null) => {
      if (val) u[k] = [val]
    }
    add("em", hashed("email", p.email))
    add("ph", hashed("phone", p.phone))
    add("fn", hashed("name", p.first_name))
    add("ln", hashed("name", p.last_name))
    add("ct", hashed("city", p.city))
    add("st", hashed("state", p.state))
    add("zp", hashed("postcode", p.postcode))
    add("country", hashed("country", p.country))
    add("external_id", hashed("email", p.external_id))
  }
  return u
}

export const metaEvent = (args: {
  name: EventName
  eventId: string
  time: Date
  data: EventData
  visitor: Visitor
  person: Person | null
  advanced: boolean
  idMode: "variant" | "product" | "sku"
}) => {
  const m = META_NAMES[args.name]
  if (!m) return null
  return {
    event_name: m.name,
    event_time: Math.floor(args.time.getTime() / 1000),
    event_id: args.eventId,
    action_source: "website",
    ...(args.visitor.page_url ? { event_source_url: args.visitor.page_url } : {}),
    user_data: metaUserData(args.visitor, args.person, args.advanced),
    custom_data: customData(args.name, args.data, args.idMode),
  }
}

export type SendResult = { ok: boolean; code: number; error?: string; retry: boolean; retryAfterMs?: number; body?: unknown }

const asError = (body: unknown, fallback: string) => {
  const e = (body as { error?: { message?: string; error_user_msg?: string } } | null)?.error
  return e?.error_user_msg || e?.message || fallback
}

export const sendToMeta = async (pixelId: string, token: string, event: Record<string, unknown>, testCode?: string): Promise<SendResult> => {
  const url = `${metaBase()}/${META_API_VERSION}/${encodeURIComponent(pixelId)}/events`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = await res.json().catch(() => null)
    if (res.ok && (body as { events_received?: number } | null)?.events_received) return { ok: true, code: res.status, retry: false, body }
    const retry = res.status === 429 || res.status >= 500
    const after = Number(res.headers.get("retry-after"))
    return { ok: false, code: res.status, error: asError(body, `Meta answered ${res.status}`), retry, retryAfterMs: after > 0 ? after * 1000 : undefined, body }
  } catch (e) {
    return { ok: false, code: 0, error: `Could not reach Meta: ${(e as Error).message}`, retry: true }
  }
}

// Checks the token can use this Pixel (and returns its name).
export const checkMetaToken = async (pixelId: string, token: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const res = await fetch(`${metaBase()}/${META_API_VERSION}/${encodeURIComponent(pixelId)}?fields=id,name`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string } | null
    if (res.ok && body?.id) return { ok: true, message: `The access token works for the Pixel "${body.name ?? body.id}".` }
    return { ok: false, message: `Meta did not accept the access token for this Pixel: ${asError(body, `answer ${res.status}`)}` }
  } catch (e) {
    return { ok: false, message: `Could not reach Meta: ${(e as Error).message}` }
  }
}
