import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  deletePostWorkflow,
  updatePostWorkflow,
} from "../../../../workflows/post"
import type { UpdatePostBodyType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdatePostBodyType>,
  res: MedusaResponse
) => {
  const { result } = await updatePostWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ post: result })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await deletePostWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "post", deleted: true })
}
