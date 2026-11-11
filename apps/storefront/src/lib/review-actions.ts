"use server"

import { getToken } from "./auth"
import { sdk } from "./medusa"

export type ReviewPhoto = { url: string; sig: string }

export type MyReview = {
  signedIn: boolean
  canReview: boolean
  review: { rating: number; title: string | null; body: string; status: "pending" | "approved" | "hidden"; photos?: ReviewPhoto[] } | null
  name: string | null
}

// Whether the signed-in shopper may review this product (they bought it), and their review.
export async function getMyReview(productId: string): Promise<MyReview> {
  const token = await getToken()
  if (!token) return { signedIn: false, canReview: false, review: null, name: null }
  try {
    const r = await sdk.client.fetch<{ can_review: boolean; review: MyReview["review"]; name: string | null }>(
      `/store/account/reviews?product_id=${encodeURIComponent(productId)}`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    return { signedIn: true, canReview: r.can_review, review: r.review, name: r.name }
  } catch {
    return { signedIn: false, canReview: false, review: null, name: null }
  }
}

export async function submitReview(input: { productId: string; rating: number; title: string; body: string; name: string; city: string; photos?: ReviewPhoto[] }) {
  const token = await getToken()
  if (!token) return { ok: false as const, error: "Please sign in first." }
  try {
    await sdk.client.fetch("/store/account/reviews", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { product_id: input.productId, rating: input.rating, title: input.title, body: input.body, name: input.name, city: input.city, ...(input.photos ? { photos: input.photos } : {}) },
    })
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as { message?: string })?.message || "The review couldn't be sent. Please try again." }
  }
}
