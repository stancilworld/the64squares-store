import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../modules/review"
import type ReviewModuleService from "../modules/review/service"

// Product reviews. Only shoppers who bought the product on the website can write one (so
// every website review is a verified purchase); it shows once someone approves it in the
// admin. The admin can also add reviews received elsewhere (Etsy, WhatsApp, in person).

export type ReviewRow = {
  id: string
  product_id: string
  rating: number
  title: string | null
  body: string
  name: string
  city: string | null
  customer_id: string | null
  verified: boolean
  status: "pending" | "approved" | "hidden"
  source: "website" | "admin" | "etsy"
  reply: string | null
  reviewed_at: Date | string
  created_at?: Date | string
  photos?: string[] | null
}

// A photo the shopper uploaded for their review: the signature proves the store made it.
const photoSecret = () => process.env.JWT_SECRET || process.env.COOKIE_SECRET || "dev-secret"
export const photoSig = (url: string) => crypto.createHmac("sha256", photoSecret()).update(`review-photo:${url}`).digest("base64url").slice(0, 32)
export const photosFrom = (input: unknown): string[] | null => {
  if (!Array.isArray(input)) return null
  const out: string[] = []
  for (const p of input.slice(0, 3)) {
    const { url, sig } = (p ?? {}) as { url?: unknown; sig?: unknown }
    if (typeof url === "string" && typeof sig === "string" && url.length < 1000 && sig === photoSig(url)) out.push(url)
  }
  return out
}

export type Summary = { count: number; average: number; stars: [number, number, number, number, number] }

// Count, average (one decimal) and how many reviews gave 1–5 stars.
export const summarise = (ratings: number[]): Summary => {
  const stars: Summary["stars"] = [0, 0, 0, 0, 0]
  let total = 0
  for (const r of ratings) {
    const n = Math.min(5, Math.max(1, Math.round(r)))
    stars[n - 1]++
    total += n
  }
  return { count: ratings.length, average: ratings.length ? Math.round((total / ratings.length) * 10) / 10 : 0, stars }
}

// What the website shows of a review: no customer ids, first name and initial only.
export const publicName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "Customer"
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

export const publicReview = (r: ReviewRow) => ({
  id: r.id,
  rating: r.rating,
  title: r.title,
  body: r.body,
  name: publicName(r.name),
  city: r.city,
  verified: r.verified,
  source: r.source,
  reply: r.reply,
  date: new Date(r.reviewed_at).toISOString(),
  photos: Array.isArray(r.photos) ? r.photos.slice(0, 3) : [],
})

const service = (c: MedusaContainer) => c.resolve<ReviewModuleService>(REVIEW_MODULE)

export const approvedFor = async (c: MedusaContainer, productId: string) => {
  const rows = (await service(c).listReviews({ product_id: productId, status: "approved" }, { order: { reviewed_at: "DESC" }, take: 500 })) as unknown as ReviewRow[]
  return { summary: summarise(rows.map((r) => r.rating)), reviews: rows.map(publicReview) }
}

// Star summaries for many products at once (shop cards).
export const summariesFor = async (c: MedusaContainer) => {
  const rows = (await service(c).listReviews({ status: "approved" }, { select: ["product_id", "rating"], take: 20_000 })) as unknown as ReviewRow[]
  const by = new Map<string, number[]>()
  for (const r of rows) by.set(r.product_id, [...(by.get(r.product_id) ?? []), r.rating])
  return Object.fromEntries([...by].map(([id, ratings]) => {
    const s = summarise(ratings)
    return [id, { count: s.count, average: s.average }]
  }))
}

// Whether this customer bought the product (an order with it that wasn't cancelled).
export const hasBought = async (c: MedusaContainer, customer: { id: string; email: string }, productId: string) => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "items.product_id"],
    filters: { $or: [{ customer_id: customer.id }, { email: customer.email }] } as Record<string, unknown>,
  })
  return (data as { status: string; items?: { product_id: string | null }[] }[]).some(
    (o) => o.status !== "canceled" && (o.items ?? []).some((i) => i?.product_id === productId)
  )
}

export const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : ""
