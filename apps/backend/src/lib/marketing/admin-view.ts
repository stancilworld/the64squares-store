import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MARKETING_MODULE } from "../../modules/marketing"
import type MarketingModuleService from "../../modules/marketing/service"
import { storeUrl } from "../emails"
import { describeServiceKeys } from "../service-keys"
import { secretsOf } from "./engine"
import { checkMetaToken, metaEvent, sendToMeta } from "./meta"
import { ga4Event, validateGa4 } from "./ga4"
import {
  INTEGRATIONS,
  type Integration,
  MARKETING_SETTINGS_KEY,
  type MarketingSettings,
  fingerprintOf,
  isLive,
  loadMarketingSettings,
  missingFor,
  statusOf,
} from "./settings"
import { saveSettingWorkflow } from "../../workflows/setting"

const LABELS: Record<Integration, string> = {
  meta_pixel: "Meta Pixel",
  meta_capi: "Meta Conversions API",
  ga4: "Google Analytics 4",
  google_ads: "Google Ads",
  gtm: "Google Tag Manager",
  clarity: "Microsoft Clarity",
}

const SERVER_PLATFORM: Partial<Record<Integration, string>> = { meta_capi: "meta_capi", ga4: "ga4_mp" }

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
  if (s.consent.mode === "notice") {
    warnings.push("Tracking starts before visitors agree. India's data protection law (DPDP Act) and the EU's GDPR expect consent first: \"Ask first\" is safer.")
  }
  const { pending_checks: _p, ...settings } = s
  return {
    settings,
    integrations,
    secrets: {
      meta_capi_token: { set: !!secrets.meta, preview: key("META_CAPI_TOKEN")?.preview ?? null, source: key("META_CAPI_TOKEN")?.source ?? null },
      ga4_api_secret: { set: !!secrets.ga4, preview: key("GA4_API_SECRET")?.preview ?? null, source: key("GA4_API_SECRET")?.source ?? null },
    },
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

  // Tags on the website. GA4's server copy is checked first, when it's switched on.
  if (i === "ga4" && s.ga4.server_enabled) {
    const body = ga4Event({
      name: "Purchase",
      data: { value: 1, currency: "INR", order_id: "test", items: [{ product_id: "test", name: "Test", price: 1, quantity: 1 }] },
      idMode: s.content_id,
      time: new Date(),
      clientId: "123.456",
      consent: { analytics: true, marketing: false },
    })
    const v = await validateGa4(s.ga4.measurement_id, secrets.ga4!, body!)
    if (!v.ok) return record(false, v.message)
  }
  const nonce = crypto.randomBytes(16).toString("hex")
  const next = { ...s, pending_checks: { ...s.pending_checks, [i]: { nonce, at: new Date().toISOString() } } }
  await save(c, next)
  return { ok: true, pending: true, url: `${storeUrl()}/?t64-tag-check=${nonce}`, message: "Opening your website to check the tag loads…" }
}
