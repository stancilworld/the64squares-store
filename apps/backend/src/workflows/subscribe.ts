import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { NEWSLETTER_MODULE } from "../modules/newsletter"
import NewsletterModuleService from "../modules/newsletter/service"
import { AUTOMATION_MODULE } from "../modules/automation"
import type AutomationModuleService from "../modules/automation/service"

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

// Signing up again after "Stop these emails" turns the emails back on.
const clearEmailOptOutStep = createStep(
  "clear-email-opt-out",
  async (input: Input, { container }) => {
    const s: AutomationModuleService = container.resolve(AUTOMATION_MODULE)
    const logs = await s.listEmailLogs({ kind: "opt_out", key: input.email.trim().toLowerCase() })
    if (logs.length) await s.softDeleteEmailLogs(logs.map((l) => l.id))
    return new StepResponse(null, logs.map((l) => l.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await (container.resolve(AUTOMATION_MODULE) as AutomationModuleService).restoreEmailLogs(ids)
  }
)

export const subscribeWorkflow = createWorkflow("subscribe", (input: Input) => {
  const subscriber = subscribeStep(input)
  clearEmailOptOutStep(input)
  return new WorkflowResponse(subscriber)
})
