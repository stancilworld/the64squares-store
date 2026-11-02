import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  deletePageWorkflow,
  updatePageWorkflow,
} from "../../../../workflows/page"
import type { UpdatePageBodyType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdatePageBodyType>,
  res: MedusaResponse
) => {
  const { result } = await updatePageWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ page: result })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await deletePageWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "page", deleted: true })
}
