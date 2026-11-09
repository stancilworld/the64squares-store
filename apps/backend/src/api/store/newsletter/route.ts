import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { dispatchSoon } from "../../../lib/marketing/engine"
import { trackServerEventWorkflow } from "../../../workflows/marketing"
import { subscribeWorkflow } from "../../../workflows/subscribe"
import type { NewsletterBodyType } from "../../admin/validators"

// POST /store/newsletter { email }
export const POST = async (
  req: MedusaRequest<NewsletterBodyType>,
  res: MedusaResponse
) => {
  await subscribeWorkflow(req.scope).run({
    input: { email: req.validatedBody.email, source: req.validatedBody.source },
  })
  // For the email tools and webhooks (Settings → Marketing & integrations).
  try {
    const { result } = await trackServerEventWorkflow(req.scope).run({ input: { kind: "subscribe", id: req.validatedBody.email, source: req.validatedBody.source ?? "newsletter" } })
    dispatchSoon(req.scope, result.ids)
  } catch {
    // The sign-up is saved either way.
  }
  res.json({ ok: true })
}
