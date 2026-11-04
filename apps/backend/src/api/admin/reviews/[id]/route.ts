import { deleteReviewWorkflow, updateReviewWorkflow } from "../../../../workflows/review"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { clean } from "../../../../lib/reviews"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"

// POST /admin/reviews/:id { status?, reply? }: approve / hide a review, or answer it.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  const reviews = req.scope.resolve<ReviewModuleService>(REVIEW_MODULE)
  await reviews.retrieveReview(req.params.id)
  const update: Record<string, unknown> = { id: req.params.id }
  if (b.status === "pending" || b.status === "approved" || b.status === "hidden") update.status = b.status
  if (b.reply !== undefined) update.reply = clean(b.reply, 1000) || null
  const { result: review } = await updateReviewWorkflow(req.scope).run({ input: update as { id: string } })
  res.json({ review })
}

// DELETE /admin/reviews/:id
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteReviewWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
