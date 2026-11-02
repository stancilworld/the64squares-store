import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  deleteContentBlockWorkflow,
  updateContentBlockWorkflow,
} from "../../../../workflows/content-block"
import type { UpdateContentBlockBodyType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateContentBlockBodyType>,
  res: MedusaResponse
) => {
  const { result } = await updateContentBlockWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ content_block: result })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await deleteContentBlockWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "content_block", deleted: true })
}
