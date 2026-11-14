import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// Website → Site features: an on/off switch for everything shoppers can see that's about
// promotion (bars, pop-ups, badges, share buttons…), plus the words each one shows. Public:
// the website reads it on every page.
export const SITE_FEATURES_KEY = "site_features"

export type SiteFeatures = {
  announcement: {
    enabled: boolean
    text: string
    link_url: string
    link_label: string
    style: "amber" | "ink"
    starts_at: string | null
    ends_at: string | null
  }
  popup: {
    enabled: boolean
    kind: "newsletter" | "offer"
    title: string
    body: string
    coupon_code: string
    image_url: string | null
    button_label: string
    button_url: string
    delay_seconds: number
    // Shown again to the same visitor after this many days (once dismissed).
    again_after_days: number
    pages: "all" | "home" | "shop"
  }
  countdowns: { enabled: boolean }
  reviews: { enabled: boolean; photos: boolean }
  newsletter_footer: { enabled: boolean; title: string; body: string }
  coupon_box: { enabled: boolean }
  code_badges: { enabled: boolean; code: string; text: string }
  back_in_stock: { enabled: boolean }
  referrals: { enabled: boolean; give_amount: number; get_amount: number; min_order: number }
  breadcrumbs: { enabled: boolean }
  faq: { enabled: boolean }
  share_buttons: { enabled: boolean }
  push: { enabled: boolean; prompt_after_seconds: number }
  business_profile: { enabled: boolean; url: string; label: string }
  // Voice chat in tournament lobbies (moderators switch it on per lobby too).
  lobby_voice: { enabled: boolean }
}

export const DEFAULT_SITE_FEATURES: SiteFeatures = {
  announcement: {
    enabled: false,
    text: "Free shipping across India on orders over ₹2,999",
    link_url: "/shop",
    link_label: "Shop now",
    style: "ink",
    starts_at: null,
    ends_at: null,
  },
  popup: {
    enabled: false,
    kind: "newsletter",
    title: "Get 10% off your first order",
    body: "Join our list for new sets, tournament news and member-only offers.",
    coupon_code: "",
    image_url: null,
    button_label: "Shop now",
    button_url: "/shop",
    delay_seconds: 12,
    again_after_days: 14,
    pages: "all",
  },
  countdowns: { enabled: true },
  reviews: { enabled: true, photos: true },
  newsletter_footer: { enabled: true, title: "Stay in the game", body: "New sets, tournament news and offers. No spam." },
  coupon_box: { enabled: true },
  code_badges: { enabled: false, code: "", text: "Use code {code} at checkout" },
  back_in_stock: { enabled: true },
  referrals: { enabled: false, give_amount: 100, get_amount: 100, min_order: 999 },
  breadcrumbs: { enabled: true },
  faq: { enabled: true },
  share_buttons: { enabled: true },
  push: { enabled: false, prompt_after_seconds: 30 },
  business_profile: { enabled: false, url: "", label: "Find us on Google" },
  lobby_voice: { enabled: false },
}

// Fills in anything missing (new switches added later get their defaults).
export const resolveSiteFeatures = (stored: unknown): SiteFeatures => {
  const s = (stored ?? {}) as Partial<Record<keyof SiteFeatures, Record<string, unknown>>>
  const out = {} as Record<string, unknown>
  for (const k of Object.keys(DEFAULT_SITE_FEATURES) as (keyof SiteFeatures)[]) {
    out[k] = { ...DEFAULT_SITE_FEATURES[k], ...(s[k] ?? {}) }
  }
  return out as SiteFeatures
}

export const loadSiteFeatures = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveSiteFeatures(await content.getSettingValue(SITE_FEATURES_KEY))
}

// The announcement bar is "on" only inside its dates.
export const announcementLive = (a: SiteFeatures["announcement"], now = new Date()) =>
  a.enabled && !!a.text.trim() && (!a.starts_at || new Date(a.starts_at) <= now) && (!a.ends_at || new Date(a.ends_at) > now)
