import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MARKETING_MODULE } from "../../modules/marketing"
import type MarketingModuleService from "../../modules/marketing/service"
import { storeUrl } from "../emails"
import { describeServiceKeys } from "../service-keys"
import { secretsOf } from "./engine"
import { checkMetaToken, metaEvent, sendToMeta } from "./meta"
import { apiBase, waNumber } from "./events"
import { LINKEDIN_VERSION, WA_API_VERSION, call, klaviyoHeaders, mailchimpBase, webhookSender } from "./senders"
import { ga4Event, validateGa4 } from "./ga4"
import {
  DEFS,
  INTEGRATIONS,
  type Integration,
  SECRET_NAMES,
  type SecretName,
  type Secrets,
  MARKETING_SETTINGS_KEY,
  type MarketingSettings,
  fingerprintOf,
  isLive,
  loadMarketingSettings,
  missingFor,
  statusOf,
} from "./settings"
import { saveSettingWorkflow } from "../../workflows/setting"

export const LABELS: Record<Integration, string> = {
  meta_pixel: "Meta Pixel",
  meta_capi: "Meta Conversions API",
  ga4: "Google Analytics 4",
  google_ads: "Google Ads",
  gtm: "Google Tag Manager",
  clarity: "Microsoft Clarity",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  microsoft_ads: "Microsoft Advertising",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp Business",
  brevo: "Brevo",
  mailchimp: "Mailchimp",
  klaviyo: "Klaviyo",
}

const SERVER_PLATFORM: Partial<Record<Integration, string>> = {
  meta_capi: "meta_capi",
  ga4: "ga4_mp",
  pinterest: "pinterest_capi",
  snapchat: "snap_capi",
  microsoft_ads: "uet_capi",
  linkedin: "linkedin_capi",
  whatsapp: "whatsapp",
  brevo: "brevo",
  mailchimp: "mailchimp",
  klaviyo: "klaviyo",
}

// Did the last few server deliveries for this integration fail (in the last day)?
const recentlyFailing = async (c: MedusaContainer, i: Integration) => {
  const p = SERVER_PLATFORM[i]
  if (!p) return false
  const m: MarketingModuleService = c.resolve(MARKETING_MODULE)
  const last = await m.listMarketingDeliveries(
    { platform: p, status: ["success", "failed"], last_attempt_at: { $gte: new Date(Date.now() - 86_400_000) } } as never,
    { take: 1, order: { last_attempt_at: "DESC" } }
  )
  return last[0]?.status === "failed"
}

// Everything the Marketing & integrations page shows (no secret values, only whether
// each secret is set and its last 4 characters).
export const marketingView = async (c: MedusaContainer) => {
  const s = await loadMarketingSettings(c)
  const secrets = await secretsOf(c)
  const keys = await describeServiceKeys(c)
  const key = (n: string) => keys.keys.find((k) => k.name === n)
  const integrations = await Promise.all(
    INTEGRATIONS.map(async (i) => {
      const st = statusOf(s, i, secrets, await recentlyFailing(c, i))
      const check = s.checks[i]
      return {
        key: i,
        label: LABELS[i],
        ...st,
        live: isLive(s, i, secrets),
        enabled: s[i].enabled,
        missing: missingFor(s, i, secrets),
        tested: !!check && check.fingerprint === fingerprintOf(s, i, secrets) && check.ok,
        last_check: check ?? null,
      }
    })
  )
  const warnings: string[] = []
  if (s.gtm.enabled && s.ga4.enabled) {
    warnings.push(
      "Google Tag Manager and Google Analytics are both switched on. If your GTM container also has a Google Analytics tag, every visit is counted twice: keep GA4 here and remove it from GTM, or switch GA4 off here."
    )
  }
  if (s.gtm.enabled && s.meta_pixel.enabled) {
    warnings.push("If your GTM container also has the Meta Pixel, remove it there: the Pixel is already added here.")
  }
  if (s.meta_capi.enabled && s.meta_capi.test_event_code) {
    warnings.push("Meta Conversions API is sending with a test event code, so its events only show in Meta's Test events tab. Remove the code when you're done testing.")
  }
  if (s.whatsapp.enabled && !secrets.whatsapp_app_secret) {
    warnings.push("WhatsApp: add the app secret so delivery updates from Meta can be checked. Until then they're ignored.")
  }
  if (s.consent.mode === "notice") {
    warnings.push("Tracking starts before visitors agree. India's data protection law (DPDP Act) and the EU's GDPR expect consent first: \"Ask first\" is safer.")
  }
  const { pending_checks: _p, ...settings } = s
  return {
    settings,
    integrations,
    // Whether each secret is set and its last 4 characters, never the value.
    secrets: Object.fromEntries(
      (Object.entries(SECRET_NAMES) as [SecretName, string][]).map(([short, name]) => [
        short,
        { name, set: !!secrets[short], preview: key(name)?.preview ?? null, source: key(name)?.source ?? null },
      ])
    ),
    webhooks: s.webhooks.endpoints.map(({ secret_enc: _e, ...ep }) => ep),
    whatsapp_webhook_url: `${(process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")}/webhooks/whatsapp`,
    whatsapp_verify_token: whatsappVerifyToken(),
    warnings,
    store_url: storeUrl(),
  }
}

const save = (c: MedusaContainer, s: MarketingSettings) =>
  saveSettingWorkflow(c).run({ input: { key: MARKETING_SETTINGS_KEY, value: s as unknown as Record<string, unknown> } })

// Runs the test for one integration. Server ones (Meta Conversions API, GA4's server copy)
// are checked from here; tags are checked by opening the website with a one-time code.
export const runTest = async (c: MedusaContainer, i: Integration) => {
  const s = await loadMarketingSettings(c)
  const secrets = await secretsOf(c)
  const missing = missingFor(s, i, secrets)
  if (missing.length) return { ok: false, message: `Add ${missing.join(", ")} first.` }
  const record = async (ok: boolean, message: string) => {
    const next = { ...s, checks: { ...s.checks, [i]: { ok, message, at: new Date().toISOString(), fingerprint: fingerprintOf(s, i, secrets) } } }
    await save(c, next)
    return { ok, message }
  }

  if (i === "meta_capi") {
    const token = await checkMetaToken(s.meta_pixel.pixel_id, secrets.meta!)
    if (!token.ok) return record(false, token.message)
    if (!s.meta_capi.test_event_code) {
      return record(true, `${token.message} To also send a test event, add a test event code from Meta Events Manager → Test events.`)
    }
    const ev = metaEvent({
      name: "PageView",
      eventId: `test_${crypto.randomUUID()}`,
      time: new Date(),
      data: {},
      visitor: { page_url: storeUrl(), user_agent: "The 64 Squares connection test", ip: "127.0.0.1" },
      person: null,
      advanced: false,
      idMode: s.content_id,
    })
    const r = await sendToMeta(s.meta_pixel.pixel_id, secrets.meta!, ev!, s.meta_capi.test_event_code)
    return r.ok
      ? record(true, `${token.message} A test event was received: see Meta Events Manager → Test events.`)
      : record(false, `The token works, but Meta refused the test event: ${r.error}`)
  }

  // Server parts first (when switched on), then the tag on the website.
  const server = await serverCheck(i, s, secrets)
  if (server && !server.ok) return record(false, server.message)
  if (!DEFS[i].browser) return record(true, server?.message ?? "Connected.")
  const nonce = crypto.randomBytes(16).toString("hex")
  const next = { ...s, pending_checks: { ...s.pending_checks, [i]: { nonce, at: new Date().toISOString(), ...(server ? { note: server.message } : {}) } } }
  await save(c, next)
  return { ok: true, pending: true, url: `${storeUrl()}/?t64-tag-check=${nonce}`, message: "Opening your website to check the tag loads…" }
}

// The verify token Meta sends when the WhatsApp webhook is set up (derived from the server's secret).
export const whatsappVerifyToken = () => crypto.createHmac("sha256", `${process.env.JWT_SECRET || "supersecret"}|wa-verify`).update("t64").digest("hex").slice(0, 24)

const sampleItems = [{ product_id: "test", variant_id: "test", name: "Connection test", price: 1, quantity: 1 }]

// The server half of a test: credentials checked with each platform's own API, or a test
// event in its test mode. null: nothing to check on the server.
const serverCheck = async (i: Integration, s: MarketingSettings, k: Secrets): Promise<{ ok: boolean; message: string } | null> => {
  switch (i) {
    case "ga4": {
      if (!s.ga4.server_enabled) return null
      const body = ga4Event({
        name: "Purchase",
        data: { value: 1, currency: "INR", order_id: "test", items: sampleItems },
        idMode: s.content_id,
        time: new Date(),
        clientId: "123.456",
        consent: { analytics: true, marketing: false },
      })
      return validateGa4(s.ga4.measurement_id, k.ga4!, body!)
    }
    case "pinterest": {
      if (!s.pinterest.capi_enabled) return null
      const r = await call(
        `${apiBase("pinterest", "https://api.pinterest.com")}/v5/ad_accounts/${encodeURIComponent(s.pinterest.ad_account_id)}/events?test=true`,
        {
          headers: { authorization: `Bearer ${k.pinterest}` },
          body: { data: [{ event_name: "page_visit", action_source: "web", event_time: Math.floor(Date.now() / 1000), event_id: `test_${crypto.randomUUID()}`, event_source_url: storeUrl(), user_data: { client_ip_address: "127.0.0.1", client_user_agent: "The 64 Squares connection test" }, custom_data: {} }] },
        },
        (st, b) => st >= 200 && st < 300 && (b?.num_events_received ?? 0) >= 1
      )
      return r.ok ? { ok: true, message: "Pinterest accepted a test event (test mode: not recorded). " } : { ok: false, message: `Pinterest refused the test event: ${r.error}` }
    }
    case "snapchat": {
      if (!s.snapchat.capi_enabled) return null
      const r = await call(
        `${apiBase("snap", "https://tr.snapchat.com")}/v3/${encodeURIComponent(s.snapchat.pixel_id)}/events/validate?access_token=${encodeURIComponent(k.snapchat!)}`,
        { body: { data: [{ event_name: "PAGE_VIEW", event_time: Math.floor(Date.now() / 1000), event_id: `test_${crypto.randomUUID()}`, action_source: "WEB", event_source_url: storeUrl(), user_data: { client_ip_address: "127.0.0.1", client_user_agent: "The 64 Squares connection test" } }] } },
        (st, b) => st >= 200 && st < 300 && b?.status !== "INVALID"
      )
      return r.ok ? { ok: true, message: "Snapchat validated a test event (not recorded). " } : { ok: false, message: `Snapchat refused the token or the test event: ${r.error}` }
    }
    case "microsoft_ads": {
      if (!s.microsoft_ads.capi_enabled) return null
      // Sent with ad storage consent "denied", so Microsoft never uses it for ads.
      const r = await call(`${apiBase("uet", "https://capi.uet.microsoft.com")}/v1/${encodeURIComponent(s.microsoft_ads.tag_id)}/events`, {
        headers: { authorization: `Bearer ${k.microsoft}` },
        body: {
          data: [{ eventType: "custom", eventId: `test_${crypto.randomUUID()}`, eventName: "t64_connection_test", eventTime: Math.floor(Date.now() / 1000), adStorageConsent: "D", userData: { anonymousId: crypto.randomBytes(16).toString("hex"), clientUserAgent: "The 64 Squares connection test" } }],
          dataProvider: "the64squares",
        },
      })
      return r.ok ? { ok: true, message: "Microsoft accepted a test event (marked \"consent denied\", so it's never used for ads). " } : { ok: false, message: `Microsoft refused the token or the test event: ${r.error}` }
    }
    case "linkedin": {
      if (!s.linkedin.capi_enabled) return null
      const r = await call(
        `${apiBase("linkedin", "https://api.linkedin.com")}/rest/conversions?q=account&account=${encodeURIComponent(`urn:li:sponsoredAccount:${s.linkedin.ad_account_id}`)}`,
        { method: "GET", headers: { authorization: `Bearer ${k.linkedin}`, "Linkedin-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" } }
      )
      if (!r.ok) return { ok: false, message: `LinkedIn refused the token or ad account: ${r.error}` }
      const rules = ((r.body as { elements?: { id: number | string; enabled?: boolean; name?: string }[] } | null)?.elements ?? []).filter((e) => e.enabled !== false)
      const wanted = [s.linkedin.purchase_conversion_id, s.linkedin.lead_conversion_id].filter(Boolean)
      const missing = wanted.filter((w) => !rules.some((e) => String(e.id) === w))
      return missing.length
        ? { ok: false, message: `These conversion IDs aren't active conversions in that ad account: ${missing.join(", ")}.` }
        : { ok: true, message: `LinkedIn found ${wanted.length === 1 ? "the conversion" : "both conversions"} in your ad account. ` }
    }
    case "whatsapp": {
      const base = apiBase("meta", "https://graph.facebook.com")
      const r = await call(`${base}/${WA_API_VERSION}/${encodeURIComponent(s.whatsapp.phone_number_id)}?fields=display_phone_number,verified_name`, { method: "GET", headers: { authorization: `Bearer ${k.whatsapp}` } })
      if (!r.ok) return { ok: false, message: `WhatsApp refused the token or phone number ID: ${r.error}` }
      const b = r.body as { display_phone_number?: string; verified_name?: string } | null
      const who = `${b?.verified_name ?? "your business"} (${b?.display_phone_number ?? s.whatsapp.phone_number_id})`
      const to = waNumber(s.whatsapp.test_number)
      if (!to) return { ok: true, message: `Connected to ${who}. Add a test number to also receive a test message.` }
      // "hello_world" is the sample template every WhatsApp Business account has.
      const m = await call(`${base}/${WA_API_VERSION}/${encodeURIComponent(s.whatsapp.phone_number_id)}/messages`, {
        headers: { authorization: `Bearer ${k.whatsapp}` },
        body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: "hello_world", language: { policy: "deterministic", code: "en_US" } } },
      })
      return m.ok
        ? { ok: true, message: `Connected to ${who}. A test message was sent to ${s.whatsapp.test_number}.` }
        : { ok: false, message: `Connected to ${who}, but the test message failed: ${m.error}` }
    }
    case "brevo": {
      const headers = { "api-key": k.brevo!, accept: "application/json" }
      const base = apiBase("brevo", "https://api.brevo.com")
      const acc = await call(`${base}/v3/account`, { method: "GET", headers })
      if (!acc.ok) return { ok: false, message: `Brevo refused the API key: ${acc.error}` }
      const list = await call(`${base}/v3/contacts/lists/${encodeURIComponent(s.brevo.list_id)}`, { method: "GET", headers })
      return list.ok
        ? { ok: true, message: `Connected to Brevo. Subscribers go to the list "${(list.body as { name?: string } | null)?.name ?? s.brevo.list_id}".` }
        : { ok: false, message: `The API key works, but list ${s.brevo.list_id} wasn't found: ${list.error}` }
    }
    case "mailchimp": {
      const base = `${mailchimpBase(k.mailchimp!)}/3.0/lists/${encodeURIComponent(s.mailchimp.audience_id)}`
      const headers = { authorization: `Bearer ${k.mailchimp}` }
      const list = await call(base, { method: "GET", headers })
      if (!list.ok) return { ok: false, message: `Mailchimp refused the API key or Audience ID: ${list.error}` }
      const fields = await call(`${base}/merge-fields?count=100`, { method: "GET", headers })
      const hasUrl = ((fields.body as { merge_fields?: { tag: string }[] } | null)?.merge_fields ?? []).some((f) => f.tag === "CARTURL")
      return {
        ok: true,
        message: `Connected to the audience "${(list.body as { name?: string } | null)?.name ?? s.mailchimp.audience_id}".${hasUrl ? "" : " Tip: add a text merge field with the tag CARTURL to put the cart link in reminder emails."}`,
      }
    }
    case "klaviyo": {
      const r = await call(`${apiBase("klaviyo", "https://a.klaviyo.com")}/api/lists/${encodeURIComponent(s.klaviyo.list_id)}`, { method: "GET", headers: klaviyoHeaders(k.klaviyo!) })
      return r.ok
        ? { ok: true, message: `Connected to Klaviyo. Subscribers go to the list "${(r.body as { data?: { attributes?: { name?: string } } } | null)?.data?.attributes?.name ?? s.klaviyo.list_id}".` }
        : { ok: false, message: `Klaviyo refused the API key or list ID: ${r.error}` }
    }
    default:
      return null
  }
}

// Sends a signed test call to one webhook endpoint.
export const testWebhook = async (c: MedusaContainer, id: string) => {
  const s = await loadMarketingSettings(c)
  const ep = s.webhooks.endpoints.find((e) => e.id === id)
  if (!ep) return { ok: false, message: "Webhook not found." }
  const sender = webhookSender({ ...ep, events: ["PageView"] })
  const body = { id: `test_${crypto.randomUUID()}`, type: "Test", created_at: new Date().toISOString(), data: { message: "Connection test from The 64 Squares" } }
  const r = await sender.send(body, s, {})
  const result = { ok: r.ok, at: new Date().toISOString(), message: r.ok ? `Your endpoint answered ${r.code}.` : `The endpoint didn't accept it: ${r.error}` }
  const next = { ...s, webhooks: { endpoints: s.webhooks.endpoints.map((e) => (e.id === id ? { ...e, last_test: result } : e)) } }
  await save(c, next)
  return result
}
