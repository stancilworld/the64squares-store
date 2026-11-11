import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteRedirectWorkflow, saveRedirectWorkflow } from "../../../../../workflows/seo"
import type { RedirectBodyType } from "../../../validators"

export const POST = async (req: AuthenticatedMedusaRequest<RedirectBodyType>, res: MedusaResponse) => {
  const { result } = await saveRedirectWorkflow(req.scope).run({ input: { ...req.validatedBody, id: req.params.id } })
  res.json({ redirect: result })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteRedirectWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, deleted: true })
}
