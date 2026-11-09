import crypto from "node:crypto"
import { cartFromToken, recoveryToken, stripPersonal } from "../engine"
import { type EventData, hashedE164, hashedMsEmail, sha256 } from "../events"
import { type BuildArgs, senderByPlatform, signWebhook, webhookSender } from "../senders"
import { type MarketingSettings, type WebhookEndpoint, resolveMarketingSettings } from "../settings"

// Payloads for the platforms added after Meta and Google, built the way each one documents.

const settings = (): MarketingSettings =>
  resolveMarketingSettings({
    pinterest: { enabled: true, tag_id: "2612345678901", capi_enabled: true, ad_account_id: "549755885175", test_mode: false },
    snapchat: { enabled: true, pixel_id: "1a2b3c4d-1234-5678-9abc-123456789abc", capi_enabled: true },
    microsoft_ads: { enabled: true, tag_id: "187654321", capi_enabled: true },
    linkedin: { enabled: true, partner_id: "1234567", purchase_conversion_id: "11111111", lead_conversion_id: "", capi_enabled: true, ad_account_id: "512345678" },
    whatsapp: { enabled: true, phone_number_id: "106540352242922", language: "en", template_order: "order_confirmed", template_shipped: "order_shipped", template_abandoned: "cart_reminder", test_number: "" },
    brevo: { enabled: true, list_id: "3" },
    mailchimp: { enabled: true, audience_id: "a1b2c3d4e5" },
    klaviyo: { enabled: true, list_id: "AbC123" },
  })

const ORDER: EventData = {
  value: 2499,
  currency: "inr",
  order_id: "order_01ABC",
  items: [
    { product_id: "prod_1", variant_id: "variant_1", sku: "BOARD-W", name: "Walnut board", price: 1999, quantity: 1 },
    { product_id: "prod_2", variant_id: "variant_2", name: "Pieces", price: 250, quantity: 2 },
  ],
  extra: { display_id: 1042 },
}

const args = (over: Partial<BuildArgs> = {}): BuildArgs => ({
  name: "Purchase",
  eventId: "purchase_order_01ABC",
  time: new Date("2026-11-09T10:00:00Z"),
  data: ORDER,
  visitor: { ip: "203.0.113.9", user_agent: "Mozilla/5.0", ids: { li_fat_id: "li-123", msclkid: "ms-456", sc_click_id: "sc-789", epik: "ep-1" } },
  person: { email: "Asha.Shopper+chess@Example.com", phone: "98765 01234", first_name: "Asha", last_name: "Rao" },
  consent: { analytics: true, marketing: true },
  optin: { email: true, whatsapp: true },
  s: settings(),
  k: {},
  ...over,
})

const sender = (p: string) => senderByPlatform(settings(), p)!

describe("Pinterest", () => {
  it("sends orders as checkout with hashed details and the shared event id", () => {
    const body = sender("pinterest_capi").build(args()) as any
    const ev = body.data?.[0] ?? body
    expect(ev.event_name).toBe("checkout")
    expect(ev.event_id).toBe("purchase_order_01ABC")
    expect(ev.action_source).toBe("web")
    expect(ev.user_data.em).toEqual([sha256("asha.shopper+chess@example.com")])
    expect(ev.user_data.click_id).toBe("ep-1")
    expect(ev.custom_data).toMatchObject({ currency: "INR", value: "2499", order_id: "order_01ABC" })
    expect(ev.custom_data.contents).toHaveLength(2)
  })
  it("needs marketing consent", () => {
    expect(sender("pinterest_capi").blocked(args({ consent: { analytics: true, marketing: false } }))).toMatch(/marketing/)
  })
  it("has no PageView on the server", () => {
    expect(sender("pinterest_capi").build(args({ name: "PageView" }))).toBeNull()
  })
})

describe("Snapchat", () => {
  it("uses WEB, PURCHASE and the dedup ids Snapchat matches on", () => {
    const body = sender("snap_capi").build(args()) as any
    const ev = body.data?.[0] ?? body
    expect(ev.event_name).toBe("PURCHASE")
    expect(ev.action_source).toBe("WEB")
    expect(ev.event_id).toBe("purchase_order_01ABC")
    expect(ev.user_data.sc_click_id).toBe("sc-789")
    expect(ev.custom_data.order_id).toBe("order_01ABC")
  })
})

describe("Microsoft UET", () => {
  it("normalises email the Microsoft way and E.164 phone before hashing", () => {
    expect(hashedMsEmail("Asha.Shopper+chess@Example.com")).toBe(sha256("ashashopper@example.com"))
    expect(hashedE164("98765 01234")).toBe(sha256("+919876501234"))
    const body = sender("uet_capi").build(args()) as any
    const ev = body.data?.[0] ?? body
    expect(ev.eventType).toBe("custom")
    expect(ev.eventName).toBe("purchase")
    expect(ev.eventId).toBe("purchase_order_01ABC")
    expect(ev.adStorageConsent).toBe("G")
    expect(ev.userData.em).toBe(sha256("ashashopper@example.com"))
    expect(ev.userData.msclkid).toBe("ms-456")
    expect(ev.customData).toMatchObject({ value: 2499, currency: "INR", transactionId: "order_01ABC" })
  })
  it("isn't sent without anything to match on", () => {
    const a = args({ person: null, visitor: { ip: "203.0.113.9" } })
    expect(sender("uet_capi").blocked(a)).not.toBeNull()
  })
})

describe("LinkedIn", () => {
  it("sends the order conversion with hashed email, click id and amount as text", () => {
    const body = sender("linkedin_capi").build(args()) as any
    expect(body.conversion).toBe("urn:lla:llaPartnerConversion:11111111")
    expect(body.conversionHappenedAt).toBe(Date.parse("2026-11-09T10:00:00Z"))
    expect(body.conversionValue).toEqual({ currencyCode: "INR", amount: "2499" })
    expect(body.eventId).toBe("purchase_order_01ABC")
    expect(body.user.userIds).toEqual(
      expect.arrayContaining([
        { idType: "SHA256_EMAIL", idValue: sha256("asha.shopper+chess@example.com") },
        { idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: "li-123" },
      ])
    )
  })
  it("skips events with no conversion set", () => {
    expect(sender("linkedin_capi").build(args({ name: "Lead" }))).toBeNull()
  })
})

describe("WhatsApp", () => {
  it("sends the order template with name, order number and total", () => {
    const body = sender("whatsapp").build(args()) as any
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919876501234", type: "template" })
    expect(body.template.name).toBe("order_confirmed")
    expect(body.template.language.code).toBe("en")
    const params = body.template.components[0].parameters.map((p: any) => p.text)
    expect(params[0]).toBe("Asha")
    expect(params[1]).toContain("1042")
    expect(params[2]).toContain("2,499")
  })
  it("only to customers who asked for it", () => {
    expect(sender("whatsapp").blocked(args({ optin: { email: true, whatsapp: false } }))).toMatch(/didn't ask/)
    expect(sender("whatsapp").blocked(args({ person: { email: "a@b.co" } }))).toMatch(/mobile/)
    // Cookie choices don't matter here: the customer asked for the message at checkout.
    expect(sender("whatsapp").blocked(args({ consent: { analytics: false, marketing: false } }))).toBeNull()
  })
  it("has nothing to send for browsing events", () => {
    expect(sender("whatsapp").build(args({ name: "AddToCart" }))).toBeNull()
  })
})

describe("email tools", () => {
  it("need the customer's agreement to marketing emails", () => {
    for (const p of ["brevo", "mailchimp", "klaviyo"]) {
      expect(sender(p).blocked(args({ optin: { email: false, whatsapp: true } }))).toMatch(/agree/)
      expect(sender(p).blocked(args({ optin: null }))).not.toBeNull()
      expect(sender(p).blocked(args())).toBeNull()
    }
  })
  it("Brevo gets the contact for the list and an order_placed event", () => {
    const body = sender("brevo").build(args()) as any
    expect(body.contact.email).toBe("asha.shopper+chess@example.com")
    expect(body.contact.listIds).toEqual([3])
    expect(body.event.event_name).toBe("order_placed")
    expect(body.event.identifiers.email_id).toBe("asha.shopper+chess@example.com")
  })
  it("Mailchimp addresses the member by the MD5 of the lower-case email and tags them", () => {
    const body = sender("mailchimp").build(args({ name: "AbandonedCart", data: { extra: { recovery_url: "https://the64squares.com/cart/recover/x" } } })) as any
    expect(body.hash).toBe(crypto.createHash("md5").update("asha.shopper+chess@example.com").digest("hex"))
    expect(body.tags).toEqual(expect.arrayContaining([{ name: "abandoned-cart", status: "active" }]))
    expect(body.cart_url).toBe("https://the64squares.com/cart/recover/x")
  })
  it("Klaviyo gets a Placed Order event with a unique id and value", () => {
    const body = sender("klaviyo").build(args()) as any
    const a = body.body.data.attributes
    expect(a.metric.data.attributes.name).toBe("Placed Order")
    expect(a.unique_id).toBe("purchase_order_01ABC")
    expect(a.value).toBe(2499)
    expect(a.profile.data.attributes.email).toBe("asha.shopper+chess@example.com")
  })
})

describe("webhooks", () => {
  const ep: WebhookEndpoint = { id: "abc", url: "https://hooks.example.com/x", events: ["Purchase"], enabled: true, secret_enc: "", secret_last4: "1234", created_at: "", last_test: null }
  it("send only the chosen events", () => {
    expect(webhookSender(ep).build(args({ name: "AddToCart" }))).toBeNull()
    const body = webhookSender(ep).build(args()) as any
    expect(body).toMatchObject({ id: "purchase_order_01ABC", type: "Purchase" })
    expect(body.data.order_id).toBe("order_01ABC")
    expect(body.data.items).toHaveLength(2)
  })
  it("are signed with an HMAC of time and body that a receiver can check", () => {
    const sig = signWebhook("whsec_test", '{"a":1}', 1700000000)
    expect(sig).toBe(`t=1700000000,v1=${crypto.createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex")}`)
  })
})

describe("cart recovery links", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret"
  })
  it("round-trip, and a changed link is refused", () => {
    const t = recoveryToken("cart_01ABCDEF")
    expect(cartFromToken(t)).toBe("cart_01ABCDEF")
    expect(cartFromToken(t.replace("cart_01ABCDEF", "cart_01ABCDEG"))).toBeNull()
    expect(cartFromToken(`${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}`)).toBeNull()
    expect(cartFromToken("nonsense")).toBeNull()
  })
})

describe("after delivery", () => {
  it("contact details are removed from the stored copy, everywhere in it", () => {
    const out = stripPersonal({ to: "919876501234", template: { name: "x" }, contact: { email: "a@b.co", listIds: [3] }, data: { customer: { email: "a@b.co" }, order_id: "o1" } }) as any
    expect(out.to).toBe("removed after delivery")
    expect(out.contact.email).toBe("removed after delivery")
    expect(out.contact.listIds).toEqual([3])
    expect(out.data.customer).toBe("removed after delivery")
    expect(out.data.order_id).toBe("o1")
  })
})
