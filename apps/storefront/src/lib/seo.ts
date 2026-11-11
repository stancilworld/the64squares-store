import type { Metadata } from "next"
import { cacheLife, cacheTag } from "next/cache"
import { getSiteConfig } from "./data"
import { sdk } from "./medusa"
import { SITE_URL } from "./site"

// Custom search settings from the admin (SEO), by web address, applied on top of each page's
// own title and description.

export const SITE_DESCRIPTION = "Premium chess sets, boards, pieces and clocks, made in India. Play online and join tournaments."

export type PageSeo = { title: string | null; description: string | null; image_url: string | null; noindex: boolean }

export async function getSeoPages(): Promise<Record<string, PageSeo>> {
  "use cache"
  cacheLife({ stale: 30, revalidate: 30, expire: 3600 })
  cacheTag("seo")
  try {
    return (await sdk.client.fetch<{ pages: Record<string, PageSeo> }>("/store/seo")).pages ?? {}
  } catch {
    return {}
  }
}

// A page's metadata: its own title/description/picture, unless the admin set others.
export async function seoMetadata(o: {
  path: string
  title: string
  description?: string | null
  image?: string | null
  type?: "website" | "article"
  // The page's title is already complete (doesn't get " | The 64 Squares" added).
  absoluteTitle?: boolean
  publishedAt?: string | null
}): Promise<Metadata> {
  const custom = (await getSeoPages())[o.path]
  const title = custom?.title || o.title
  // Falls back to the site's description (Settings → SEO & analytics), as the layout does.
  const description = custom?.description || o.description || (await getSiteConfig()).default_description.trim() || SITE_DESCRIPTION
  const image = custom?.image_url || o.image || undefined
  const absolute = !!custom?.title || o.absoluteTitle
  return {
    title: absolute ? { absolute: title } : title,
    ...(description ? { description } : {}),
    alternates: { canonical: o.path },
    ...(custom?.noindex ? { robots: { index: false, follow: true } } : {}),
    // Replaces the site-wide one, so it repeats the site name and language.
    openGraph: {
      siteName: "The 64 Squares",
      locale: "en_IN",
      title,
      ...(description ? { description } : {}),
      url: o.path,
      type: o.type ?? "website",
      ...(o.type === "article" && o.publishedAt ? { publishedTime: o.publishedAt } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, ...(description ? { description } : {}), ...(image ? { images: [image] } : {}) },
  }
}

// Structured data for Google, written safely into the page.
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") })

export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path}`)
