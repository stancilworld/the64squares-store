import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteShowcaseAdWorkflow, updateShowcaseAdWorkflow } from "../../../../../workflows/showcase"
import type { ShowcaseAdBodyType } from "../../../validators"

// POST /admin/showcase/ads/:id: change an advert (any of its fields).
export const POST = async (req: AuthenticatedMedusaRequest<Partial<ShowcaseAdBodyType>>, res: MedusaResponse) => {
  const { result } = await updateShowcaseAdWorkflow(req.scope).run({ input: { id: req.params.id, ...req.validatedBody } })
  res.json({ ad: result })
}

// DELETE /admin/showcase/ads/:id
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteShowcaseAdWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, deleted: true })
}
