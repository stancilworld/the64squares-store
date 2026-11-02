import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// The website's top menu, footer and announcement bar (admin → Website → Menu & footer).
// The defaults are what the designs show, so the site looks the same until someone edits.

export const SITE_NAVIGATION_KEY = "site_navigation"

export type NavLink = { label: string; href: string }
export type FooterLink = NavLink & { same_line?: boolean }

export type SiteNavigation = {
  menu: {
    categories_label: string
    all_label: string
    about_label: string
    about_links: NavLink[]
    extra_links: NavLink[]
  }
  footer: {
    tagline: string
    col1_title: string
    col1_links: FooterLink[]
    col2_title: string
    col2_links: FooterLink[]
    socials: { facebook: string; instagram: string; linkedin: string; youtube: string; whatsapp: string }
  }
  announcement: {
    enabled: boolean
    text: string
    link_label: string
    href: string
    colour: "black" | "red" | "yellow" | "blue"
    starts_at: string | null
    ends_at: string | null
    dismissible: boolean
  }
}

export const DEFAULT_SITE_NAVIGATION: SiteNavigation = {
  menu: {
    categories_label: "Shop",
    all_label: "All products",
    about_label: "About",
    about_links: [
      { label: "About us", href: "/about" },
      { label: "The 64 Squares Journal", href: "/blog" },
    ],
    extra_links: [
      { label: "Play", href: "/play" },
      { label: "Tournaments", href: "/tournaments" },
    ],
  },
  footer: {
    tagline: "Chess sets, boards and clocks, made in India.",
    col1_title: "Shop",
    col1_links: [
      { label: "All products", href: "/shop" },
      { label: "About us", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
    col2_title: "Help",
    col2_links: [
      { label: "Delivery", href: "/help/delivery" },
      { label: "Returns & warranty", href: "/help/returns-and-warranty" },
      { label: "FAQs", href: "/help/faqs" },
      { label: "Privacy", href: "/help/privacy", same_line: true },
      { label: "Terms", href: "/help/terms", same_line: true },
    ],
    socials: {
      facebook: "",
      instagram: "",
      linkedin: "",
      youtube: "",
      whatsapp: "",
    },
  },
  announcement: {
    enabled: false,
    text: "",
    link_label: "",
    href: "",
    colour: "black",
    starts_at: null,
    ends_at: null,
    dismissible: true,
  },
}

export const resolveSiteNavigation = (stored: Record<string, unknown> | null | undefined): SiteNavigation => {
  const s = (stored ?? {}) as Partial<SiteNavigation>
  const d = DEFAULT_SITE_NAVIGATION
  return {
    menu: { ...d.menu, ...(s.menu ?? {}) },
    footer: { ...d.footer, ...(s.footer ?? {}), socials: { ...d.footer.socials, ...(s.footer?.socials ?? {}) } },
    announcement: { ...d.announcement, ...(s.announcement ?? {}) },
  }
}

export const loadSiteNavigation = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveSiteNavigation(await content.getSettingValue(SITE_NAVIGATION_KEY))
}
