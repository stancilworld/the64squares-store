import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { NEWSLETTER_MODULE } from "../modules/newsletter"
import NewsletterModuleService from "../modules/newsletter/service"

type Input = { email: string; source?: string }

// Adds an email to the newsletter list; signing up twice is harmless.
const subscribeStep = createStep(
  "subscribe",
  async (input: Input, { container }) => {
    const service: NewsletterModuleService = container.resolve(NEWSLETTER_MODULE)
    const email = input.email.trim().toLowerCase()
    const [existing] = await service.listSubscribers({ email })
    if (existing) {
      return new StepResponse(existing, null)
    }
    const created = await service.createSubscribers({
      email,
      source: input.source ?? "website",
    })
    return new StepResponse(created, created.id)
  },
  async (createdId, { container }) => {
    if (!createdId) {
      return
    }
    const service: NewsletterModuleService = container.resolve(NEWSLETTER_MODULE)
    await service.deleteSubscribers(createdId)
  }
)

export const subscribeWorkflow = createWorkflow(
  "subscribe",
  (input: Input) => new WorkflowResponse(subscribeStep(input))
)
