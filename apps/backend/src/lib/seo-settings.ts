import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// Search engines and analytics, editable in the admin (Settings → SEO & analytics).
// Everything here is public: the website puts it in every page.
export const SEO_SETTINGS_KEY = "seo_settings"

export type SeoSettings = {
  // Google Analytics 4 measurement id, e.g. G-ABC123XYZ9.
  ga4_id: string
  // Meta (Facebook / Instagram) Pixel id, digits only.
  meta_pixel_id: string
  // Google Search Console "HTML tag" verification code (the content="…" part).
  google_verification: string
  // The site's description in Google results and link previews (home and pages without their own).
  default_description: string
}

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  ga4_id: "",
  meta_pixel_id: "",
  google_verification: "",
  default_description: "",
}

export const resolveSeoSettings = (stored: Record<string, unknown> | null | undefined): SeoSettings => ({
  ...DEFAULT_SEO_SETTINGS,
  ...((stored ?? {}) as Partial<SeoSettings>),
})

export const loadSeoSettings = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveSeoSettings(await content.getSettingValue(SEO_SETTINGS_KEY))
}
