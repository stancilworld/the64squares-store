import { CONTENT_MODULE } from "../../../modules/content"
import { MARKETING_MODULE } from "../../../modules/marketing"
import { clearServiceKeyCache } from "../../service-keys"
import { BACKOFF_MS, MAX_ATTEMPTS, dispatchDue, queueServerDeliveries } from "../engine"
import { contentIdOf, customerHash, hashed, sha256 } from "../events"
import { ga4Event, gaClientId } from "../ga4"
import { metaEvent } from "../meta"
import { type MarketingSettings, fingerprintOf, isLive, missingFor, resolveMarketingSettings, statusOf } from "../settings"

// ------------------------------------------------------------------ fakes

// An in-memory stand-in for the marketing module and the settings store.
const fakeContainer = (settings: Partial<MarketingSettings> | null) => {
  const deliveries: Record<string, any>[] = []
  let n = 0
  const match = (row: Record<string, any>, f: Record<string, any>) =>
    Object.entries(f).every(([k, v]) => {
      if (Array.isArray(v)) return v.includes(row[k])
      if (v && typeof v === "object" && "$lte" in v) return row[k] && row[k] <= v.$lte
      if (v && typeof v === "object" && "$lt" in v) return row[k] && row[k] < v.$lt
      return row[k] === v
    })
  const marketing = {
    createMarketingDeliveries: async (r: Record<string, any>) => {
      if (deliveries.some((d) => d.event_id === r.event_id && d.platform === r.platform)) throw new Error("unique")
      const row = { id: `mdl_${++n}`, created_at: new Date(Date.now() - 60_000), ...r }
      deliveries.push(row)
      return row
    },
    listMarketingDeliveries: async (f: Record<string, any>) => deliveries.filter((d) => match(d, f)),
    updateMarketingDeliveries: async (u: Record<string, any>) => Object.assign(deliveries.find((d) => d.id === u.id)!, u),
  }
  const content = { getSettingValue: async (key: string) => (key === "marketing_settings" ? settings : null) }
  return {
    deliveries,
    container: { resolve: (k: string) => (k === MARKETING_MODULE ? marketing : k === CONTENT_MODULE ? content : null) } as any,
  }
}

const SECRETS = { meta: "EAAtesttoken1234567890abcdefghijklmnopqrstuvwxyz", ga4: "secret_123456" }

// Settings with Meta (Pixel + CAPI) and GA4 (with server copy) tested and switched on.
const liveSettings = (): MarketingSettings => {
  const s = resolveMarketingSettings({
    meta_pixel: { enabled: true, pixel_id: "123456789012345" },
    meta_capi: { enabled: true, test_event_code: "", advanced_matching: true },
    ga4: { enabled: true, measurement_id: "G-ABC12345", server_enabled: true },
  })
  for (const i of ["meta_pixel", "meta_capi", "ga4"] as const) s.checks[i] = { ok: true, at: new Date().toISOString(), message: "ok", fingerprint: fingerprintOf(s, i, SECRETS) }
  return s
}

beforeEach(() => {
  process.env.META_CAPI_TOKEN = SECRETS.meta
  process.env.GA4_API_SECRET = SECRETS.ga4
  clearServiceKeyCache()
})

// ------------------------------------------------------------------ hashing

describe("customer details", () => {
  it("are normalised before hashing, the way Meta asks", () => {
    expect(hashed("email", "  Asha.Shopper@Example.COM ")).toBe(sha256("asha.shopper@example.com"))
    expect(hashed("phone", "98765 01234")).toBe(sha256("919876501234"))
    expect(hashed("phone", "+91 98765-01234")).toBe(sha256("919876501234"))
    expect(hashed("city", "New Delhi")).toBe(sha256("newdelhi"))
    expect(hashed("country", "IN")).toBe(sha256("in"))
  })
  it("give nothing for empty values", () => {
    expect(hashed("email", "")).toBeNull()
    expect(hashed("phone", null)).toBeNull()
  })
  it("customer hash for deletion is not the plain email hash sent to Meta", () => {
    expect(customerHash("a@b.co")).not.toBe(sha256("a@b.co"))
    expect(customerHash("A@B.co ")).toBe(customerHash("a@b.co"))
  })
})

// ------------------------------------------------------------------ payloads

describe("Meta Conversions API event", () => {
  const ev = metaEvent({
    name: "Purchase",
    eventId: "purchase_order_01ABC",
    time: new Date("2026-11-10T10:00:00Z"),
    data: {
      value: 3798,
      currency: "inr",
      order_id: "order_01ABC",
      items: [
        { product_id: "prod_1", variant_id: "variant_1", sku: "SKU-1", name: "Board", price: 2499, quantity: 1 },
        { product_id: "prod_2", variant_id: "variant_2", sku: null, name: "Set", price: 1299, quantity: 1 },
      ],
    },
    visitor: { ip: "203.0.113.5", user_agent: "UA", fbp: "fb.1.1.2", fbc: "fb.1.1.abc", page_url: "https://the64squares.in/checkout" },
    person: { email: "A@b.co", phone: "9876501234", first_name: "Asha", last_name: "Verma", external_id: "cus_1" },
    advanced: true,
    idMode: "variant",
  })!
  it("keeps the shared event id, so the Pixel's copy isn't counted twice", () => {
    expect(ev.event_id).toBe("purchase_order_01ABC")
    expect(ev.event_name).toBe("Purchase")
    expect(ev.action_source).toBe("website")
    expect(ev.event_time).toBe(Math.floor(new Date("2026-11-10T10:00:00Z").getTime() / 1000))
  })
  it("hashes contact details and sends IP, browser and Meta cookies as they are", () => {
    const u = ev.user_data as Record<string, any>
    expect(u.em).toEqual([sha256("a@b.co")])
    expect(u.ph).toEqual([sha256("919876501234")])
    expect(u.external_id).toEqual([sha256("cus_1")])
    expect(u.client_ip_address).toBe("203.0.113.5")
    expect(u.fbc).toBe("fb.1.1.abc")
    expect(JSON.stringify(u)).not.toContain("A@b.co")
  })
  it("carries every product, the value and currency", () => {
    const c = ev.custom_data as Record<string, any>
    expect(c.currency).toBe("INR")
    expect(c.value).toBe(3798)
    expect(c.content_ids).toEqual(["variant_1", "variant_2"])
    expect(c.num_items).toBe(2)
    expect(c.order_id).toBe("order_01ABC")
  })
  it("sends no contact details when matching is off", () => {
    const off = metaEvent({ name: "Lead", eventId: "lead_1", time: new Date(), data: {}, visitor: {}, person: { email: "a@b.co" }, advanced: false, idMode: "variant" })!
    expect(off.user_data).toEqual({})
  })
  it("has no Refund (Meta has no such event)", () => {
    expect(metaEvent({ name: "Refund", eventId: "r", time: new Date(), data: {}, visitor: {}, person: null, advanced: true, idMode: "variant" })).toBeNull()
  })
})

describe("product ids", () => {
  const item = { product_id: "prod_1", variant_id: "variant_1", sku: "SKU-1" }
  it("follow the chosen mapping, falling back when missing", () => {
    expect(contentIdOf(item, "variant")).toBe("variant_1")
    expect(contentIdOf(item, "product")).toBe("prod_1")
    expect(contentIdOf(item, "sku")).toBe("SKU-1")
    expect(contentIdOf({ product_id: "prod_1" }, "sku")).toBe("prod_1")
  })
})

describe("GA4 Measurement Protocol event", () => {
  it("has the transaction id, items and consent", () => {
    const b = ga4Event({
      name: "Purchase",
      data: { value: 10, currency: "INR", order_id: "order_1", items: [{ product_id: "prod_1", variant_id: "variant_1", price: 10, quantity: 1 }] },
      idMode: "variant",
      time: new Date(),
      clientId: gaClientId("GA1.1.111.222"),
      consent: { analytics: true, marketing: false },
    })! as Record<string, any>
    expect(b.client_id).toBe("111.222")
    expect(b.events[0].name).toBe("purchase")
    expect(b.events[0].params.transaction_id).toBe("order_1")
    expect(b.events[0].params.items[0].item_id).toBe("variant_1")
    expect(b.consent.ad_user_data).toBe("DENIED")
  })
  it("makes up a client id when the visitor had no _ga cookie", () => {
    expect(gaClientId(null)).toMatch(/^\d+\.\d+$/)
  })
})

// ------------------------------------------------------------------ statuses

describe("integration status", () => {
  it("is Not connected with nothing set", () => {
    const s = resolveMarketingSettings(null)
    expect(statusOf(s, "meta_pixel", {}, false).status).toBe("not_connected")
  })
  it("asks for what's missing", () => {
    const s = resolveMarketingSettings({ meta_pixel: { enabled: false, pixel_id: "12" } })
    expect(statusOf(s, "meta_pixel", {}, false).status).toBe("configuration_required")
    expect(missingFor(resolveMarketingSettings({ meta_capi: { enabled: true } }), "meta_capi", {})).toContain("access token")
  })
  it("is only Connected after a passing test with the current settings", () => {
    const s = liveSettings()
    expect(statusOf(s, "meta_capi", SECRETS, false).status).toBe("connected")
    expect(isLive(s, "meta_capi", SECRETS)).toBe(true)
    // A new token means a new test.
    const other = { ...SECRETS, meta: "EAAanothertoken000000000000000000000000000000" }
    expect(statusOf(s, "meta_capi", other, false).status).toBe("configuration_required")
    expect(isLive(s, "meta_capi", other)).toBe(false)
    // A changed Pixel ID too.
    const moved = { ...s, meta_pixel: { ...s.meta_pixel, pixel_id: "999999999999999" } }
    expect(isLive(moved, "meta_pixel", SECRETS)).toBe(false)
  })
  it("shows a failed test as Error, and recent delivery failures too", () => {
    const s = liveSettings()
    s.checks.meta_capi = { ...s.checks.meta_capi!, ok: false, message: "Invalid OAuth access token." }
    expect(statusOf(s, "meta_capi", SECRETS, false)).toMatchObject({ status: "error", message: "Invalid OAuth access token." })
    expect(statusOf(liveSettings(), "meta_capi", SECRETS, true).status).toBe("error")
  })
  it("is Disabled when tested but switched off", () => {
    const s = liveSettings()
    s.ga4.enabled = false
    expect(statusOf(s, "ga4", SECRETS, false).status).toBe("disabled")
    expect(isLive(s, "ga4", SECRETS)).toBe(false)
  })
})

// ------------------------------------------------------------------ queue and consent

describe("server deliveries", () => {
  const purchase = { event_id: "purchase_order_1", name: "Purchase" as const, data: { value: 10, currency: "INR", order_id: "order_1", items: [{ product_id: "prod_1", price: 10, quantity: 1 }] }, visitor: { ip: "1.2.3.4" }, person: { email: "a@b.co" } }

  it("go to Meta and GA4 with full consent", async () => {
    const { container, deliveries } = fakeContainer(liveSettings())
    const ids = await queueServerDeliveries(container, { ...purchase, consent: { analytics: true, marketing: true } })
    expect(ids).toHaveLength(2)
    expect(deliveries.map((d) => `${d.platform}:${d.status}`).sort()).toEqual(["ga4_mp:pending", "meta_capi:pending"])
  })
  it("skip Meta without marketing consent, and GA4 without analytics consent", async () => {
    const { container, deliveries } = fakeContainer(liveSettings())
    const ids = await queueServerDeliveries(container, { ...purchase, consent: { analytics: false, marketing: false } })
    expect(ids).toHaveLength(0)
    expect(deliveries.map((d) => `${d.platform}:${d.status}`).sort()).toEqual(["ga4_mp:skipped", "meta_capi:skipped"])
    expect(JSON.stringify(deliveries)).not.toContain("1.2.3.4")
  })
  it("are queued once per event and platform (a repeated order event sends nothing new)", async () => {
    const { container, deliveries } = fakeContainer(liveSettings())
    await queueServerDeliveries(container, { ...purchase, consent: { analytics: true, marketing: true } })
    const again = await queueServerDeliveries(container, { ...purchase, consent: { analytics: true, marketing: true } })
    expect(again).toHaveLength(0)
    expect(deliveries).toHaveLength(2)
  })
  it("aren't made for integrations that aren't switched on", async () => {
    const s = liveSettings()
    s.meta_capi.enabled = false
    const { container, deliveries } = fakeContainer(s)
    await queueServerDeliveries(container, { ...purchase, consent: { analytics: true, marketing: true } })
    expect(deliveries.map((d) => d.platform)).toEqual(["ga4_mp"])
  })
  it("respect event exclusions", async () => {
    const s = liveSettings()
    s.excluded = { meta_capi: ["Purchase"] }
    const { container, deliveries } = fakeContainer(s)
    await queueServerDeliveries(container, { ...purchase, consent: { analytics: true, marketing: true } })
    expect(deliveries.map((d) => d.platform)).toEqual(["ga4_mp"])
  })
})

describe("sending with retries", () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })
  const queueOne = async () => {
    const f = fakeContainer(liveSettings())
    await queueServerDeliveries(f.container, {
      event_id: "addtocart_1",
      name: "AddToCart",
      data: { value: 10, currency: "INR", items: [{ product_id: "prod_1", price: 10, quantity: 1 }] },
      consent: { analytics: true, marketing: true },
      visitor: { ip: "1.2.3.4", user_agent: "UA" },
      person: null,
    })
    return f
  }

  it("waits and tries again when Meta is down, then succeeds and drops personal details", async () => {
    const { container, deliveries } = await queueOne()
    const d = deliveries[0]
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "down" } }), { status: 503 })) as any
    await dispatchDue(container, { ids: [d.id] })
    expect(d.status).toBe("pending")
    expect(d.attempts).toBe(1)
    expect(d.next_attempt_at.getTime() - Date.now()).toBeGreaterThan(BACKOFF_MS[0] - 2000)
    expect(d.last_error).toBe("down")

    global.fetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ events_received: 1 }), { status: 200 })) as any
    await dispatchDue(container, { ids: [d.id] })
    expect(d.status).toBe("success")
    expect(d.attempts).toBe(2)
    expect(d.payload.user_data).toEqual({ removed_after_delivery: true })
  })

  it("respects Retry-After when Meta limits the rate", async () => {
    const { container, deliveries } = await queueOne()
    const d = deliveries[0]
    global.fetch = jest.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "900" } })) as any
    await dispatchDue(container, { ids: [d.id] })
    expect(d.status).toBe("pending")
    expect(d.next_attempt_at.getTime() - Date.now()).toBeGreaterThan(890_000)
  })

  it("stops at once on a wrong token (retrying can't help)", async () => {
    const { container, deliveries } = await queueOne()
    const d = deliveries[0]
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Invalid OAuth access token." } }), { status: 400 })) as any
    await dispatchDue(container, { ids: [d.id] })
    expect(d.status).toBe("failed")
    expect(d.last_error).toBe("Invalid OAuth access token.")
  })

  it("gives up after the last try and keeps the failure for the Event Manager", async () => {
    const { container, deliveries } = await queueOne()
    const d = deliveries[0]
    global.fetch = jest.fn().mockImplementation(async () => new Response("{}", { status: 500 })) as any
    for (let i = 0; i < MAX_ATTEMPTS; i++) await dispatchDue(container, { ids: [d.id] })
    expect(d.status).toBe("failed")
    expect(d.attempts).toBe(MAX_ATTEMPTS)
    expect(d.next_attempt_at).toBeNull()
  })
})
