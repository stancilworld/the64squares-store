import { cacheLife, cacheTag } from "next/cache"
import { badgeOf, byShopOrder } from "./badges"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "./medusa"
import { previewHeaders } from "./preview"
import type {
  Category,
  ChatbotConfig,
  ContactPage,
  ContentBlock,
  Post,
  PostSummary,
  ProductCard,
  SitePage,
  TeamMember,
} from "./types"

// All store data is cached for about a minute ("minutes" profile), so edits made in
// the admin appear on the website within a minute or two without a redeploy.

export async function getRegion(): Promise<HttpTypes.StoreRegion | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("regions")
  const { regions } = await sdk.store.region.list({ limit: 10 })
  return regions.find((r) => r.currency_code === "inr") ?? regions[0] ?? null
}

export async function getContent(page = "home"): Promise<ContentBlock[]> {
  "use cache"
  cacheLife("minutes")
  cacheTag("content")
  const { blocks } = await sdk.client.fetch<{ blocks: ContentBlock[] }>(
    "/store/content",
    { query: { page }, headers: await previewHeaders() }
  )
  return blocks
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  "use cache"
  cacheLife("minutes")
  cacheTag("team")
  const { team_members } = await sdk.client.fetch<{ team_members: TeamMember[] }>(
    "/store/team-members"
  )
  return team_members
}

export async function getCategories(): Promise<Category[]> {
  "use cache"
  cacheLife("minutes")
  cacheTag("categories")
  const { product_categories } = await sdk.store.category.list({
    fields: "id,name,handle,rank",
    limit: 100,
  })
  return [...product_categories]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((c) => ({ id: c.id, name: c.name, handle: c.handle }))
}

const optionValue = (
  variant: HttpTypes.StoreProductVariant,
  title: string
): string | undefined =>
  variant.options?.find((o) => o.option?.title === title)?.value

// A sale price list is lowering at least one version's price.
export const isOnSale = (p: HttpTypes.StoreProduct) =>
  (p.variants ?? []).some((v) => {
    const c = v.calculated_price
    return !!c && typeof c.calculated_amount === "number" && typeof c.original_amount === "number" && c.calculated_amount < c.original_amount
  })

const unique = (values: (string | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v))]

// Every published product, shaped for product cards and filters. The catalogue is
// small (under 100 products), so filtering happens in code after one request.
export async function getProductCards(): Promise<ProductCard[]> {
  "use cache"
  cacheLife("minutes")
  cacheTag("products")
  const region = await getRegion()

  const { products } = await sdk.store.product.list({
    region_id: region?.id,
    limit: 200,
    fields:
      "id,title,handle,thumbnail,created_at,+metadata,*images,*categories,*variants.calculated_price,*variants.options,*variants.options.option,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder",
  })

  return [...products].sort(byShopOrder).map((p) => {
    const variants = p.variants ?? []
    const prices = variants
      .map((v) => v.calculated_price?.calculated_amount)
      .filter((n): n is number => typeof n === "number")
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      thumbnail: p.thumbnail ?? p.images?.[0]?.url ?? null,
      price: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      colours: unique(variants.map((v) => optionValue(v, "Colour"))),
      materials: unique(variants.map((v) => optionValue(v, "Material"))),
      categoryIds: (p.categories ?? []).map((c) => c.id),
      inStock: variants.some(
        (v) =>
          !v.manage_inventory ||
          v.allow_backorder ||
          (v.inventory_quantity ?? 0) > 0
      ),
      badge: badgeOf(p.metadata, isOnSale(p)),
    }
  })
}

export async function getProduct(
  handle: string
): Promise<HttpTypes.StoreProduct | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("products")
  const region = await getRegion()
  const { products } = await sdk.store.product.list({
    handle,
    region_id: region?.id,
    limit: 1,
    fields:
      "*images,*categories,*collection,*options,*options.values,*variants.images,*variants.calculated_price,*variants.options,*variants.options.option,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder,+metadata,+material,+length,+width,+height,+weight",
  })
  return products[0] ?? null
}

// Blog posts, newest first. `limit` grows as visitors press "See More".
export async function getPosts(
  limit: number
): Promise<{ posts: PostSummary[]; count: number }> {
  "use cache"
  cacheLife("minutes")
  cacheTag("posts")
  return sdk.client.fetch<{ posts: PostSummary[]; count: number }>("/store/posts", {
    query: { limit, offset: 0 },
    headers: await previewHeaders(),
  })
}

// Store API errors (e.g. 404 for an unknown handle) become null so pages can show notFound().
const orNull = async <T>(promise: Promise<T>): Promise<T | null> => {
  try {
    return await promise
  } catch {
    return null
  }
}

export async function getPost(handle: string): Promise<Post | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("posts")
  const res = await orNull(sdk.client.fetch<{ post: Post }>(`/store/posts/${handle}`, { headers: await previewHeaders() }))
  return res?.post ?? null
}

export async function getSitePage(handle: string): Promise<SitePage | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("pages")
  const res = await orNull(sdk.client.fetch<{ page: SitePage }>(`/store/pages/${handle}`, { headers: await previewHeaders() }))
  return res?.page ?? null
}

// The Contact page's panel and form (admin → Website → Contact page).
export async function getContactPage(): Promise<ContactPage | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("contact")
  try {
    const { contact } = await sdk.client.fetch<{ contact: ContactPage }>("/store/contact-page")
    return contact
  } catch {
    return null
  }
}

// The chat bubble's look and buttons (admin → Website → Chat bot).
export async function getChatbot(): Promise<ChatbotConfig | null> {
  "use cache"
  cacheLife("minutes")
  cacheTag("chatbot")
  try {
    const { chatbot } = await sdk.client.fetch<{ chatbot: ChatbotConfig }>("/store/chatbot")
    return chatbot.enabled ? chatbot : null
  } catch {
    return null
  }
}

// Swatch colours set in the admin (colour name in lower case → #hex).
export async function getColourPalette(): Promise<Record<string, string>> {
  "use cache"
  cacheLife("minutes")
  cacheTag("colours")
  try {
    const { colours } = await sdk.client.fetch<{ colours: Record<string, string> }>("/store/colours")
    return colours ?? {}
  } catch {
    return {}
  }
}

// The delivery message set in the admin (Settings → Payments & delivery).
export async function getDeliveryText(): Promise<string> {
  "use cache"
  cacheLife("minutes")
  cacheTag("checkout-config")
  try {
    const { delivery_text } = await sdk.client.fetch<{ delivery_text?: string }>("/store/checkout-config")
    return delivery_text || "Free delivery across India."
  } catch {
    return "Free delivery across India."
  }
}

export type NavLink = { label: string; href: string }
export type FooterLink = NavLink & { same_line?: boolean }
export type SiteNavigation = {
  experience: { home: "shop" | "play"; show_switch: boolean }
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

// Same as what the designs show; used if the admin can't be reached.
export const FALLBACK_NAVIGATION: SiteNavigation = {
  experience: { home: "shop", show_switch: true },
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
  announcement: { enabled: false, text: "", link_label: "", href: "", colour: "black", starts_at: null, ends_at: null, dismissible: true },
}

// Top menu, footer and announcement bar from the admin (Website → Menu & footer).
export async function getSiteNavigation(): Promise<SiteNavigation> {
  "use cache"
  cacheLife("minutes")
  cacheTag("site-navigation")
  try {
    const { navigation } = await sdk.client.fetch<{ navigation: SiteNavigation }>("/store/site-navigation")
    return navigation ?? FALLBACK_NAVIGATION
  } catch {
    return FALLBACK_NAVIGATION
  }
}
