import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { countShowcaseWorkflow } from "../../../../../workflows/showcase"

// POST /store/showcase/:id/count { what: "views" | "clicks" }: an advert was seen or used.
export const POST = async (req: MedusaRequest<{ what: "views" | "clicks" }>, res: MedusaResponse) => {
  if (/^ad_[A-Za-z0-9]+$/.test(req.params.id)) await countShowcaseWorkflow(req.scope).run({ input: { id: req.params.id, what: req.validatedBody.what } })
  res.json({ ok: true })
}
