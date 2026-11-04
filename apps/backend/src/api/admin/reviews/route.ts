import { createReviewWorkflow } from "../../../workflows/review"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { clean, type ReviewRow } from "../../../lib/reviews"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

// GET /admin/reviews?status=pending|approved|hidden&q=…: reviews with their product's name,
// plus how many wait for approval.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const reviews = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)
  const status = ["pending", "approved", "hidden"].includes(String(req.query.status)) ? (String(req.query.status) as ReviewRow["status"]) : undefined
  const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
  const [rows, pending] = await Promise.all([
    reviews.listReviews({ ...(status ? { status } : {}), ...(q ? { q } : {}) } as Record<string, unknown>, { order: { created_at: "DESC" }, take: 300 }),
    reviews.listReviews({ status: "pending" }, { select: ["id"], take: 1000 }),
  ])
  const ids = [...new Set((rows as unknown as ReviewRow[]).map((r) => r.product_id))]
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = ids.length
    ? await query.graph({ entity: "product", fields: ["id", "title", "handle", "thumbnail"], filters: { id: ids } })
    : { data: [] }
  const byId = new Map((products as { id: string }[]).map((p) => [p.id, p]))
  res.json({ reviews: (rows as unknown as ReviewRow[]).map((r) => ({ ...r, product: byId.get(r.product_id) ?? null })), pending: pending.length })
}

// POST /admin/reviews: add a review received elsewhere. Goes live straight away unless
// status says otherwise.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  const rating = Number(b.rating)
  const body = clean(b.body, 2000)
  const name = clean(b.name, 60)
  if (typeof b.product_id !== "string" || !b.product_id.startsWith("prod_")) return res.status(400).json({ message: "Choose the product." })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: "Choose 1 to 5 stars." })
  if (!body || !name) return res.status(400).json({ message: "The review and the customer's name are needed." })
  const when = typeof b.reviewed_at === "string" && !Number.isNaN(Date.parse(b.reviewed_at)) ? new Date(b.reviewed_at) : new Date()
  const { result: created } = await createReviewWorkflow(req.scope).run({ input: {
    product_id: b.product_id,
    rating,
    title: clean(b.title, 120) || null,
    body,
    name,
    city: clean(b.city, 60) || null,
    verified: b.verified === true,
    status: b.status === "pending" || b.status === "hidden" ? b.status : "approved",
    source: b.source === "etsy" ? "etsy" : "admin",
    reply: clean(b.reply, 1000) || null,
    reviewed_at: when > new Date() ? new Date() : when,
  } })
  res.json({ review: created })
}
