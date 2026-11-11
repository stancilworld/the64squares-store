import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteNewsWorkflow, updateNewsWorkflow } from "../../../../workflows/news"
import type { UpdateNewsBodyType } from "../../validators"

export const POST = async (req: AuthenticatedMedusaRequest<UpdateNewsBodyType>, res: MedusaResponse) => {
  const { result } = await updateNewsWorkflow(req.scope).run({ input: { id: req.params.id, data: req.validatedBody } })
  res.json({ article: result })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteNewsWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "news_article", deleted: true })
}
