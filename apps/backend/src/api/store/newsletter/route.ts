import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
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
  res.json({ ok: true })
}
