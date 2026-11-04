import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../modules/review"
import type ReviewModuleService from "../modules/review/service"

// Writing, changing and deleting product reviews (lib/reviews.ts), each undone if a later
// step fails.

type Fields = Record<string, unknown>

const createReviewStep = createStep(
  "create-review",
  async (input: Fields, { container }) => {
    const created = await container.resolve<ReviewModuleService>(REVIEW_MODULE).createReviews(input as never)
    return new StepResponse(created, (created as { id: string }).id)
  },
  async (id, { container }) => {
    if (id) await container.resolve<ReviewModuleService>(REVIEW_MODULE).deleteReviews(id)
  }
)

const updateReviewStep = createStep(
  "update-review",
  async (input: Fields & { id: string }, { container }) => {
    const service = container.resolve<ReviewModuleService>(REVIEW_MODULE)
    const before = (await service.retrieveReview(input.id)) as unknown as Fields
    const previous = Object.fromEntries(Object.keys(input).map((k) => [k, before[k]])) as Fields & { id: string }
    const updated = await service.updateReviews(input as never)
    return new StepResponse(updated, previous)
  },
  async (previous, { container }) => {
    if (previous) await container.resolve<ReviewModuleService>(REVIEW_MODULE).updateReviews(previous as never)
  }
)

const deleteReviewStep = createStep(
  "delete-review",
  async (id: string, { container }) => {
    await container.resolve<ReviewModuleService>(REVIEW_MODULE).softDeleteReviews(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (id) await container.resolve<ReviewModuleService>(REVIEW_MODULE).restoreReviews(id)
  }
)

export const createReviewWorkflow = createWorkflow("create-review", (input: Fields) => new WorkflowResponse(createReviewStep(input)))
export const updateReviewWorkflow = createWorkflow("update-review", (input: Fields & { id: string }) => new WorkflowResponse(updateReviewStep(input)))
export const deleteReviewWorkflow = createWorkflow("delete-review", (input: { id: string }) => new WorkflowResponse(deleteReviewStep(input.id)))
