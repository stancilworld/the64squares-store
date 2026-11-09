import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../../modules/content"
import type ContentModuleService from "../../modules/content/service"
import { SEO_SETTINGS_KEY } from "../seo-settings"

// Settings → Marketing & integrations. Public ids live here; secret keys are kept encrypted
// with the other service keys (lib/service-keys.ts) and never leave the server.

export const MARKETING_SETTINGS_KEY = "marketing_settings"

// Shop events (Meta's names). The last four are made by the store for messaging and email
// tools and webhooks; ad platforms don't get them.
export const EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "RemoveFromCart",
  "ViewCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "CompleteRegistration",
  "Lead",
  "Refund",
  "AbandonedCart",
  "OrderShipped",
  "Subscribe",
] as const
export type EventName = (typeof EVENT_NAMES)[number]

// Made by the store itself, never accepted from a browser.
export const SERVER_EVENTS: EventName[] = ["Purchase", "Refund", "CompleteRegistration", "AbandonedCart", "OrderShipped", "Subscribe"]
// Accepted from the website.
export const BROWSER_EVENTS: EventName[] = ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"]

// Where events go. "browser": the platform's tag on the website; "server": sent by this server.
export const PLATFORMS = {
  meta_pixel: { label: "Meta Pixel", channel: "browser" },
  meta_capi: { label: "Meta Conversions API", channel: "server" },
  ga4: { label: "Google Analytics 4", channel: "browser" },
  ga4_mp: { label: "GA4 (server)", channel: "server" },
  google_ads: { label: "Google Ads", channel: "browser" },
  gtm: { label: "Tag Manager", channel: "browser" },
  clarity: { label: "Clarity", channel: "browser" },
  pinterest_tag: { label: "Pinterest Tag", channel: "browser" },
  pinterest_capi: { label: "Pinterest (server)", channel: "server" },
  snap_pixel: { label: "Snap Pixel", channel: "browser" },
  snap_capi: { label: "Snapchat (server)", channel: "server" },
  uet: { label: "Microsoft UET", channel: "browser" },
  uet_capi: { label: "Microsoft (server)", channel: "server" },
  linkedin_tag: { label: "LinkedIn Insight Tag", channel: "browser" },
  linkedin_capi: { label: "LinkedIn (server)", channel: "server" },
  whatsapp: { label: "WhatsApp", channel: "server" },
  brevo: { label: "Brevo", channel: "server" },
  mailchimp: { label: "Mailchimp", channel: "server" },
  klaviyo: { label: "Klaviyo", channel: "server" },
} as const
export type Platform = keyof typeof PLATFORMS
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[]
// Webhook endpoints are platforms too: "webhook_<endpoint id>".
export const isWebhookPlatform = (p: string) => /^webhook_[a-z0-9]{8,32}$/.test(p)

export const INTEGRATIONS = [
  "meta_pixel",
  "meta_capi",
  "ga4",
  "google_ads",
  "gtm",
  "clarity",
  "pinterest",
  "snapchat",
  "microsoft_ads",
  "linkedin",
  "whatsapp",
  "brevo",
  "mailchimp",
  "klaviyo",
] as const
export type Integration = (typeof INTEGRATIONS)[number]

// Secret keys by short name → their name in the encrypted key store.
export const SECRET_NAMES = {
  meta: "META_CAPI_TOKEN",
  ga4: "GA4_API_SECRET",
  pinterest: "PINTEREST_TOKEN",
  snapchat: "SNAPCHAT_TOKEN",
  microsoft: "MICROSOFT_CAPI_TOKEN",
  linkedin: "LINKEDIN_TOKEN",
  whatsapp: "WHATSAPP_TOKEN",
  whatsapp_app_secret: "WHATSAPP_APP_SECRET",
  brevo: "BREVO_API_KEY",
  mailchimp: "MAILCHIMP_API_KEY",
  klaviyo: "KLAVIYO_API_KEY",
} as const
export type SecretName = keyof typeof SECRET_NAMES
export type Secrets = Partial<Record<SecretName, string>>

export type Check = { ok: boolean; at: string; message: string; fingerprint: string }

export type WebhookEndpoint = {
  id: string
  url: string
  events: EventName[]
  enabled: boolean
  // The signing secret, encrypted (lib/service-keys.ts encrypt); shown once when made.
  secret_enc: string
  secret_last4: string
  created_at: string
  last_test: { ok: boolean; at: string; message: string } | null
}

export type MarketingSettings = {
  consent: { mode: "ask" | "notice"; text: string; policy_url: string }
  meta_pixel: { enabled: boolean; pixel_id: string }
  meta_capi: { enabled: boolean; test_event_code: string; advanced_matching: boolean }
  ga4: { enabled: boolean; measurement_id: string; server_enabled: boolean }
  google_ads: { enabled: boolean; conversion_id: string; purchase_label: string; lead_label: string; enhanced_conversions: boolean }
  gtm: { enabled: boolean; container_id: string }
  clarity: { enabled: boolean; project_id: string }
  pinterest: { enabled: boolean; tag_id: string; capi_enabled: boolean; ad_account_id: string; test_mode: boolean }
  snapchat: { enabled: boolean; pixel_id: string; capi_enabled: boolean }
  microsoft_ads: { enabled: boolean; tag_id: string; capi_enabled: boolean }
  linkedin: { enabled: boolean; partner_id: string; purchase_conversion_id: string; lead_conversion_id: string; capi_enabled: boolean; ad_account_id: string }
  whatsapp: {
    enabled: boolean
    phone_number_id: string
    language: string
    template_order: string
    template_shipped: string
    template_abandoned: string
    test_number: string
  }
  brevo: { enabled: boolean; list_id: string }
  mailchimp: { enabled: boolean; audience_id: string }
  klaviyo: { enabled: boolean; list_id: string }
  automation: { abandoned_enabled: boolean; abandoned_after_hours: number }
  webhooks: { endpoints: WebhookEndpoint[] }
  content_id: "variant" | "product" | "sku"
  excluded: Partial<Record<Platform, EventName[]>>
  retention_days: number
  checks: Partial<Record<Integration, Check>>
  pending_checks: Partial<Record<Integration, { nonce: string; at: string; note?: string }>>
}

export const DEFAULT_CONSENT_TEXT =
  "We use cookies to run the shop, and with your permission to understand visits and measure our ads."

export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = {
  consent: { mode: "ask", text: DEFAULT_CONSENT_TEXT, policy_url: "/help/privacy" },
  meta_pixel: { enabled: false, pixel_id: "" },
  meta_capi: { enabled: false, test_event_code: "", advanced_matching: true },
  ga4: { enabled: false, measurement_id: "", server_enabled: false },
  google_ads: { enabled: false, conversion_id: "", purchase_label: "", lead_label: "", enhanced_conversions: true },
  gtm: { enabled: false, container_id: "" },
  clarity: { enabled: false, project_id: "" },
  pinterest: { enabled: false, tag_id: "", capi_enabled: false, ad_account_id: "", test_mode: false },
  snapchat: { enabled: false, pixel_id: "", capi_enabled: false },
  microsoft_ads: { enabled: false, tag_id: "", capi_enabled: false },
  linkedin: { enabled: false, partner_id: "", purchase_conversion_id: "", lead_conversion_id: "", capi_enabled: false, ad_account_id: "" },
  whatsapp: { enabled: false, phone_number_id: "", language: "en", template_order: "", template_shipped: "", template_abandoned: "", test_number: "" },
  brevo: { enabled: false, list_id: "" },
  mailchimp: { enabled: false, audience_id: "" },
  klaviyo: { enabled: false, list_id: "" },
  automation: { abandoned_enabled: true, abandoned_after_hours: 2 },
  webhooks: { endpoints: [] },
  content_id: "variant",
  excluded: {},
  retention_days: 30,
  checks: {},
  pending_checks: {},
}

export const ID_PATTERNS = {
  pixel_id: /^\d{10,20}$/,
  measurement_id: /^G-[A-Z0-9]{4,16}$/,
  conversion_id: /^AW-\d{6,14}$/,
  conversion_label: /^[\w-]{6,40}$/,
  container_id: /^GTM-[A-Z0-9]{4,12}$/,
  clarity_id: /^[a-z0-9]{6,20}$/,
  test_event_code: /^TEST\d{3,10}$/,
  pinterest_tag: /^\d{10,16}$/,
  pinterest_account: /^\d{8,20}$/,
  snap_pixel: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  uet_tag: /^\d{5,12}$/,
  linkedin_partner: /^\d{4,12}$/,
  linkedin_conversion: /^\d{4,14}$/,
  linkedin_account: /^\d{6,14}$/,
  wa_phone_id: /^\d{10,20}$/,
  wa_template: /^[a-z0-9_]{1,512}$/,
  wa_language: /^[a-z]{2,3}(_[A-Z]{2})?$/,
  phone: /^\+?\d{10,15}$/,
  brevo_list: /^\d{1,10}$/,
  mailchimp_audience: /^[a-z0-9]{6,20}$/,
  klaviyo_list: /^[A-Za-z0-9]{6,12}$/,
}

const merge = <T extends Record<string, unknown>>(base: T, over: unknown): T =>
  over && typeof over === "object" ? ({ ...base, ...(over as Partial<T>) } as T) : base

export const resolveMarketingSettings = (stored: Record<string, unknown> | null | undefined, seo?: Record<string, unknown> | null): MarketingSettings => {
  const s = (stored ?? {}) as Partial<MarketingSettings>
  const d = DEFAULT_MARKETING_SETTINGS
  const out: MarketingSettings = {
    consent: merge(d.consent, s.consent),
    meta_pixel: merge(d.meta_pixel, s.meta_pixel),
    meta_capi: merge(d.meta_capi, s.meta_capi),
    ga4: merge(d.ga4, s.ga4),
    google_ads: merge(d.google_ads, s.google_ads),
    gtm: merge(d.gtm, s.gtm),
    clarity: merge(d.clarity, s.clarity),
    pinterest: merge(d.pinterest, s.pinterest),
    snapchat: merge(d.snapchat, s.snapchat),
    microsoft_ads: merge(d.microsoft_ads, s.microsoft_ads),
    linkedin: merge(d.linkedin, s.linkedin),
    whatsapp: merge(d.whatsapp, s.whatsapp),
    brevo: merge(d.brevo, s.brevo),
    mailchimp: merge(d.mailchimp, s.mailchimp),
    klaviyo: merge(d.klaviyo, s.klaviyo),
    automation: merge(d.automation, s.automation),
    webhooks: { endpoints: s.webhooks?.endpoints ?? [] },
    content_id: s.content_id ?? d.content_id,
    excluded: s.excluded ?? {},
    retention_days: s.retention_days ?? d.retention_days,
    checks: s.checks ?? {},
    pending_checks: s.pending_checks ?? {},
  }
  // Ids typed in the older Settings → SEO & analytics page carry over until this page is saved.
  if (!stored && seo) {
    const pixel = String(seo.meta_pixel_id ?? "").trim()
    const ga = String(seo.ga4_id ?? "").trim()
    if (pixel) out.meta_pixel = { enabled: false, pixel_id: pixel }
    if (ga) out.ga4 = { ...out.ga4, measurement_id: ga }
  }
  return out
}

export const loadMarketingSettings = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const [stored, seo] = await Promise.all([content.getSettingValue(MARKETING_SETTINGS_KEY), content.getSettingValue(SEO_SETTINGS_KEY)])
  return resolveMarketingSettings(stored as Record<string, unknown> | null, seo as Record<string, unknown> | null)
}

// ------------------------------------------------------------------ what each integration needs

type Def = {
  // Something is set at all (else "Not connected").
  started: (s: MarketingSettings, k: Secrets) => boolean
  // What's still missing, in plain words.
  missing: (s: MarketingSettings, k: Secrets) => string[]
  // The settings and secrets a passed test depends on.
  depends: (s: MarketingSettings, k: Secrets) => unknown[]
  // It has a tag on the website (tested by opening the website).
  browser: boolean
}

const need = (cond: boolean, what: string) => (cond ? [] : [what])
const secretHash = (v: string | undefined) => (v ? crypto.createHash("sha256").update(v).digest("hex") : null)

export const DEFS: Record<Integration, Def> = {
  meta_pixel: {
    started: (s) => !!s.meta_pixel.pixel_id,
    missing: (s) => need(ID_PATTERNS.pixel_id.test(s.meta_pixel.pixel_id), "Pixel ID"),
    depends: (s) => [s.meta_pixel.pixel_id],
    browser: true,
  },
  meta_capi: {
    started: (s, k) => !!k.meta || s.meta_capi.enabled,
    missing: (s, k) => [
      ...need(ID_PATTERNS.pixel_id.test(s.meta_pixel.pixel_id), "Pixel ID (in Meta Pixel)"),
      ...need(!!k.meta, "access token"),
      ...need(!s.meta_capi.test_event_code || ID_PATTERNS.test_event_code.test(s.meta_capi.test_event_code), "a valid test event code"),
    ],
    depends: (s, k) => [s.meta_pixel.pixel_id, secretHash(k.meta)],
    browser: false,
  },
  ga4: {
    started: (s) => !!s.ga4.measurement_id,
    missing: (s, k) => [...need(ID_PATTERNS.measurement_id.test(s.ga4.measurement_id), "Measurement ID"), ...need(!s.ga4.server_enabled || !!k.ga4, "API secret (for the server copy)")],
    depends: (s, k) => [s.ga4.measurement_id, s.ga4.server_enabled, s.ga4.server_enabled ? secretHash(k.ga4) : null],
    browser: true,
  },
  google_ads: {
    started: (s) => !!s.google_ads.conversion_id,
    missing: (s) => [
      ...need(ID_PATTERNS.conversion_id.test(s.google_ads.conversion_id), "Conversion ID"),
      ...need(!!(s.google_ads.purchase_label || s.google_ads.lead_label), "a conversion label"),
      ...[s.google_ads.purchase_label, s.google_ads.lead_label].filter((l) => l && !ID_PATTERNS.conversion_label.test(l)).map(() => "a valid conversion label"),
    ],
    depends: (s) => [s.google_ads.conversion_id],
    browser: true,
  },
  gtm: {
    started: (s) => !!s.gtm.container_id,
    missing: (s) => need(ID_PATTERNS.container_id.test(s.gtm.container_id), "Container ID"),
    depends: (s) => [s.gtm.container_id],
    browser: true,
  },
  clarity: {
    started: (s) => !!s.clarity.project_id,
    missing: (s) => need(ID_PATTERNS.clarity_id.test(s.clarity.project_id), "Project ID"),
    depends: (s) => [s.clarity.project_id],
    browser: true,
  },
  pinterest: {
    started: (s) => !!s.pinterest.tag_id,
    missing: (s, k) => [
      ...need(ID_PATTERNS.pinterest_tag.test(s.pinterest.tag_id), "Tag ID"),
      ...(s.pinterest.capi_enabled ? [...need(ID_PATTERNS.pinterest_account.test(s.pinterest.ad_account_id), "ad account ID"), ...need(!!k.pinterest, "conversion access token")] : []),
    ],
    depends: (s, k) => [s.pinterest.tag_id, s.pinterest.capi_enabled, s.pinterest.capi_enabled ? [s.pinterest.ad_account_id, secretHash(k.pinterest)] : null],
    browser: true,
  },
  snapchat: {
    started: (s) => !!s.snapchat.pixel_id,
    missing: (s, k) => [...need(ID_PATTERNS.snap_pixel.test(s.snapchat.pixel_id), "Pixel ID"), ...(s.snapchat.capi_enabled ? need(!!k.snapchat, "Conversions API token") : [])],
    depends: (s, k) => [s.snapchat.pixel_id, s.snapchat.capi_enabled, s.snapchat.capi_enabled ? secretHash(k.snapchat) : null],
    browser: true,
  },
  microsoft_ads: {
    started: (s) => !!s.microsoft_ads.tag_id,
    missing: (s, k) => [...need(ID_PATTERNS.uet_tag.test(s.microsoft_ads.tag_id), "UET tag ID"), ...(s.microsoft_ads.capi_enabled ? need(!!k.microsoft, "Conversions API token") : [])],
    depends: (s, k) => [s.microsoft_ads.tag_id, s.microsoft_ads.capi_enabled, s.microsoft_ads.capi_enabled ? secretHash(k.microsoft) : null],
    browser: true,
  },
  linkedin: {
    started: (s) => !!s.linkedin.partner_id,
    missing: (s, k) => [
      ...need(ID_PATTERNS.linkedin_partner.test(s.linkedin.partner_id), "Partner ID"),
      ...[s.linkedin.purchase_conversion_id, s.linkedin.lead_conversion_id].filter((c) => c && !ID_PATTERNS.linkedin_conversion.test(c)).map(() => "a valid conversion ID"),
      ...(s.linkedin.capi_enabled
        ? [
            ...need(!!k.linkedin, "access token"),
            ...need(ID_PATTERNS.linkedin_account.test(s.linkedin.ad_account_id), "ad account ID"),
            ...need(!!(s.linkedin.purchase_conversion_id || s.linkedin.lead_conversion_id), "a conversion ID"),
          ]
        : []),
    ],
    depends: (s, k) => [s.linkedin.partner_id, s.linkedin.capi_enabled, s.linkedin.capi_enabled ? [s.linkedin.ad_account_id, s.linkedin.purchase_conversion_id, s.linkedin.lead_conversion_id, secretHash(k.linkedin)] : null],
    browser: true,
  },
  whatsapp: {
    started: (s, k) => !!s.whatsapp.phone_number_id || !!k.whatsapp,
    missing: (s, k) => [
      ...need(ID_PATTERNS.wa_phone_id.test(s.whatsapp.phone_number_id), "Phone number ID"),
      ...need(!!k.whatsapp, "access token"),
      ...need(ID_PATTERNS.wa_language.test(s.whatsapp.language), "template language"),
      ...need(!!(s.whatsapp.template_order || s.whatsapp.template_shipped || s.whatsapp.template_abandoned), "at least one message template name"),
      ...[s.whatsapp.template_order, s.whatsapp.template_shipped, s.whatsapp.template_abandoned].filter((t) => t && !ID_PATTERNS.wa_template.test(t)).map(() => "valid template names"),
    ],
    depends: (s, k) => [s.whatsapp.phone_number_id, secretHash(k.whatsapp)],
    browser: false,
  },
  brevo: {
    started: (s, k) => !!k.brevo || !!s.brevo.list_id,
    missing: (s, k) => [...need(!!k.brevo, "API key"), ...need(ID_PATTERNS.brevo_list.test(s.brevo.list_id), "list ID")],
    depends: (s, k) => [s.brevo.list_id, secretHash(k.brevo)],
    browser: false,
  },
  mailchimp: {
    started: (s, k) => !!k.mailchimp || !!s.mailchimp.audience_id,
    missing: (s, k) => [...need(!!k.mailchimp, "API key"), ...need(ID_PATTERNS.mailchimp_audience.test(s.mailchimp.audience_id), "Audience ID")],
    depends: (s, k) => [s.mailchimp.audience_id, secretHash(k.mailchimp)],
    browser: false,
  },
  klaviyo: {
    started: (s, k) => !!k.klaviyo || !!s.klaviyo.list_id,
    missing: (s, k) => [...need(!!k.klaviyo, "private API key"), ...need(ID_PATTERNS.klaviyo_list.test(s.klaviyo.list_id), "list ID")],
    depends: (s, k) => [s.klaviyo.list_id, secretHash(k.klaviyo)],
    browser: false,
  },
}

export const fingerprintOf = (s: MarketingSettings, i: Integration, k: Secrets) =>
  crypto.createHash("sha256").update(JSON.stringify(DEFS[i].depends(s, k))).digest("hex").slice(0, 16)

export type Status = "not_connected" | "configuration_required" | "testing" | "connected" | "error" | "disabled"

export const missingFor = (s: MarketingSettings, i: Integration, k: Secrets) => DEFS[i].missing(s, k)

export const isEnabled = (s: MarketingSettings, i: Integration) => s[i].enabled

// The integration's state, as the admin shows it. "Connected" only after a passing test made
// with the current settings.
export const statusOf = (s: MarketingSettings, i: Integration, k: Secrets, recentFailure: boolean): { status: Status; message: string } => {
  if (!DEFS[i].started(s, k)) return { status: "not_connected", message: "Not set up." }
  const missing = missingFor(s, i, k)
  if (missing.length) return { status: "configuration_required", message: `Add ${missing.join(", ")}.` }
  const fp = fingerprintOf(s, i, k)
  const check = s.checks[i]
  const tested = check && check.fingerprint === fp ? check : null
  const pending = s.pending_checks[i]
  if (pending && Date.now() - new Date(pending.at).getTime() < 10 * 60_000 && (!tested || tested.at < pending.at)) {
    return { status: "testing", message: "Waiting for the test to finish." }
  }
  if (tested && !tested.ok) return { status: "error", message: tested.message }
  if (!tested) return { status: "configuration_required", message: "Run the test to finish setting up." }
  if (!isEnabled(s, i)) return { status: "disabled", message: "Tested, but switched off." }
  if (recentFailure) return { status: "error", message: "Recent events could not be delivered. See the Event Manager." }
  return { status: "connected", message: tested.message }
}

// True when the integration may run on the website / server right now.
export const isLive = (s: MarketingSettings, i: Integration, k: Secrets) => {
  if (!isEnabled(s, i) || missingFor(s, i, k).length) return false
  const check = s.checks[i]
  return !!check && check.ok && check.fingerprint === fingerprintOf(s, i, k)
}

export const isExcluded = (s: MarketingSettings, p: Platform, e: EventName) => (s.excluded[p] ?? []).includes(e)

// Which integration a delivery platform belongs to.
export const INTEGRATION_OF: Record<Platform, Integration> = {
  meta_pixel: "meta_pixel",
  meta_capi: "meta_capi",
  ga4: "ga4",
  ga4_mp: "ga4",
  google_ads: "google_ads",
  gtm: "gtm",
  clarity: "clarity",
  pinterest_tag: "pinterest",
  pinterest_capi: "pinterest",
  snap_pixel: "snapchat",
  snap_capi: "snapchat",
  uet: "microsoft_ads",
  uet_capi: "microsoft_ads",
  linkedin_tag: "linkedin",
  linkedin_capi: "linkedin",
  whatsapp: "whatsapp",
  brevo: "brevo",
  mailchimp: "mailchimp",
  klaviyo: "klaviyo",
}
