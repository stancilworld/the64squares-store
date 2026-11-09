import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../../modules/content"
import type ContentModuleService from "../../modules/content/service"
import { SEO_SETTINGS_KEY } from "../seo-settings"

// Settings → Marketing & integrations. Public ids (Pixel id, Measurement ID...) live here;
// the two secret keys (Meta access token, GA4 API secret) are kept encrypted with the other
// service keys (lib/service-keys.ts) and never leave the server.

export const MARKETING_SETTINGS_KEY = "marketing_settings"

// The shop events, with the names Meta uses. Each platform gets its own names (events.ts).
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
] as const
export type EventName = (typeof EVENT_NAMES)[number]

// Made by the store itself, never accepted from a browser: an order the payment confirmed,
// a refund, a new account.
export const SERVER_EVENTS: EventName[] = ["Purchase", "Refund", "CompleteRegistration"]

// Where events can go. "browser": the platform's tag on the website; "server": sent by this
// server.
export const PLATFORMS = {
  meta_pixel: { label: "Meta Pixel", channel: "browser" },
  meta_capi: { label: "Meta Conversions API", channel: "server" },
  ga4: { label: "Google Analytics 4", channel: "browser" },
  ga4_mp: { label: "Google Analytics 4 (server)", channel: "server" },
  google_ads: { label: "Google Ads", channel: "browser" },
  gtm: { label: "Google Tag Manager", channel: "browser" },
  clarity: { label: "Microsoft Clarity", channel: "browser" },
} as const
export type Platform = keyof typeof PLATFORMS
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[]

// The integrations shown in the admin (GA4's server copy is an option of GA4).
export const INTEGRATIONS = ["meta_pixel", "meta_capi", "ga4", "google_ads", "gtm", "clarity"] as const
export type Integration = (typeof INTEGRATIONS)[number]

export type Check = { ok: boolean; at: string; message: string; fingerprint: string }

export type MarketingSettings = {
  consent: {
    // "ask": nothing is tracked until the visitor agrees (recommended).
    // "notice": tracking is on unless the visitor turns it off.
    mode: "ask" | "notice"
    text: string
    policy_url: string
  }
  meta_pixel: { enabled: boolean; pixel_id: string }
  meta_capi: { enabled: boolean; test_event_code: string; advanced_matching: boolean }
  ga4: { enabled: boolean; measurement_id: string; server_enabled: boolean }
  google_ads: { enabled: boolean; conversion_id: string; purchase_label: string; lead_label: string; enhanced_conversions: boolean }
  gtm: { enabled: boolean; container_id: string }
  clarity: { enabled: boolean; project_id: string }
  // Which product id the platforms get: the version (variant) id, the product id or the SKU.
  // Should match the ids in a Meta / Google product catalogue, if there is one.
  content_id: "variant" | "product" | "sku"
  // Events not sent to a platform at all.
  excluded: Partial<Record<Platform, EventName[]>>
  // How long the Event Manager keeps events.
  retention_days: number
  // Last test of each integration. A test only counts for the settings it was made with.
  checks: Partial<Record<Integration, Check>>
  // Browser tests in progress: a one-time code the website reports back with.
  pending_checks: Partial<Record<Integration, { nonce: string; at: string }>>
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

// The parts of the settings (and whether each secret is set) a test depends on. Changing any
// of them means the integration has to be tested again.
export const fingerprintOf = (s: MarketingSettings, i: Integration, secrets: { meta: string | undefined; ga4: string | undefined }) => {
  const parts: Record<Integration, unknown> = {
    meta_pixel: [s.meta_pixel.pixel_id],
    meta_capi: [s.meta_pixel.pixel_id, secrets.meta ? crypto.createHash("sha256").update(secrets.meta).digest("hex") : null],
    ga4: [s.ga4.measurement_id, s.ga4.server_enabled, s.ga4.server_enabled && secrets.ga4 ? crypto.createHash("sha256").update(secrets.ga4).digest("hex") : null],
    google_ads: [s.google_ads.conversion_id],
    gtm: [s.gtm.container_id],
    clarity: [s.clarity.project_id],
  }
  return crypto.createHash("sha256").update(JSON.stringify(parts[i])).digest("hex").slice(0, 16)
}

export type Status = "not_connected" | "configuration_required" | "testing" | "connected" | "error" | "disabled"

// What's missing before an integration can be tested, in plain words (empty: ready).
export const missingFor = (s: MarketingSettings, i: Integration, secrets: { meta?: string; ga4?: string }): string[] => {
  const m: string[] = []
  switch (i) {
    case "meta_pixel":
      if (!ID_PATTERNS.pixel_id.test(s.meta_pixel.pixel_id)) m.push("Pixel ID")
      break
    case "meta_capi":
      if (!ID_PATTERNS.pixel_id.test(s.meta_pixel.pixel_id)) m.push("Pixel ID (in Meta Pixel)")
      if (!secrets.meta) m.push("access token")
      if (s.meta_capi.test_event_code && !ID_PATTERNS.test_event_code.test(s.meta_capi.test_event_code)) m.push("a valid test event code")
      break
    case "ga4":
      if (!ID_PATTERNS.measurement_id.test(s.ga4.measurement_id)) m.push("Measurement ID")
      if (s.ga4.server_enabled && !secrets.ga4) m.push("API secret (for the server copy)")
      break
    case "google_ads":
      if (!ID_PATTERNS.conversion_id.test(s.google_ads.conversion_id)) m.push("Conversion ID")
      if (!s.google_ads.purchase_label && !s.google_ads.lead_label) m.push("a conversion label")
      for (const l of [s.google_ads.purchase_label, s.google_ads.lead_label]) if (l && !ID_PATTERNS.conversion_label.test(l)) m.push("a valid conversion label")
      break
    case "gtm":
      if (!ID_PATTERNS.container_id.test(s.gtm.container_id)) m.push("Container ID")
      break
    case "clarity":
      if (!ID_PATTERNS.clarity_id.test(s.clarity.project_id)) m.push("Project ID")
      break
  }
  return m
}

const hasAnyId = (s: MarketingSettings, i: Integration, secrets: { meta?: string }) =>
  ({
    meta_pixel: !!s.meta_pixel.pixel_id,
    meta_capi: !!secrets.meta || s.meta_capi.enabled,
    ga4: !!s.ga4.measurement_id,
    google_ads: !!s.google_ads.conversion_id,
    gtm: !!s.gtm.container_id,
    clarity: !!s.clarity.project_id,
  })[i]

export const isEnabled = (s: MarketingSettings, i: Integration) => s[i].enabled

// The integration's state, as the admin shows it. "Connected" only after a passing test made
// with the current settings.
export const statusOf = (
  s: MarketingSettings,
  i: Integration,
  secrets: { meta?: string; ga4?: string },
  recentFailure: boolean
): { status: Status; message: string } => {
  if (!hasAnyId(s, i, secrets)) return { status: "not_connected", message: "Not set up." }
  const missing = missingFor(s, i, secrets)
  if (missing.length) return { status: "configuration_required", message: `Add ${missing.join(", ")}.` }
  const fp = fingerprintOf(s, i, { meta: secrets.meta, ga4: secrets.ga4 })
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
export const isLive = (s: MarketingSettings, i: Integration, secrets: { meta?: string; ga4?: string }) => {
  if (!isEnabled(s, i) || missingFor(s, i, secrets).length) return false
  const check = s.checks[i]
  return !!check && check.ok && check.fingerprint === fingerprintOf(s, i, { meta: secrets.meta, ga4: secrets.ga4 })
}

export const isExcluded = (s: MarketingSettings, p: Platform, e: EventName) => (s.excluded[p] ?? []).includes(e)
