import { createReviewWorkflow, updateReviewWorkflow } from "../../../../workflows/review"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { clean, hasBought, type ReviewRow } from "../../../../lib/reviews"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"

const isProductId = (v: unknown): v is string => typeof v === "string" && /^prod_[A-Za-z0-9]{6,40}$/.test(v)

// GET /store/account/reviews?product_id=…: can the signed-in shopper review it, and their review if any.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const productId = req.query.product_id
  if (!isProductId(productId)) return res.status(400).json({ message: "product_id is required" })
  const me = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
  const reviews = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)
  const [mine] = (await reviews.listReviews({ customer_id: me.id, product_id: productId }, { take: 1 })) as unknown as ReviewRow[]
  res.json({
    can_review: await hasBought(req.scope, me, productId),
    review: mine ? { rating: mine.rating, title: mine.title, body: mine.body, status: mine.status } : null,
    name: [me.first_name, me.last_name].filter(Boolean).join(" ") || null,
  })
}

// POST /store/account/reviews { product_id, rating, title?, body, name?, city? }: write or update
// your review. It waits for approval again after every change.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  if (!isProductId(b.product_id)) return res.status(400).json({ message: "product_id is required" })
  const rating = Number(b.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: "Choose 1 to 5 stars." })
  const body = clean(b.body, 2000)
  if (body.length < 10) return res.status(400).json({ message: "Please write a few words about the product (at least 10 letters)." })
  const me = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
  if (!(await hasBought(req.scope, me, b.product_id))) {
    return res.status(403).json({ message: "Only shoppers who bought this product can review it." })
  }
  const name = clean(b.name, 60) || [me.first_name, me.last_name].filter(Boolean).join(" ") || "Customer"
  const reviews = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)
  const fields = { rating, title: clean(b.title, 120) || null, body, name, city: clean(b.city, 60) || null, status: "pending" as const, verified: true, reviewed_at: new Date() }
  const [mine] = (await reviews.listReviews({ customer_id: me.id, product_id: b.product_id }, { take: 1 })) as unknown as ReviewRow[]
  if (mine) await updateReviewWorkflow(req.scope).run({ input: { id: mine.id, ...fields } })
  else await createReviewWorkflow(req.scope).run({ input: { ...fields, product_id: b.product_id, customer_id: me.id, source: "website" } })
  res.json({ ok: true, status: "pending" })
}
