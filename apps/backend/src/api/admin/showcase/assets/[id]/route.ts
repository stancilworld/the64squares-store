import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteShowcaseAssetWorkflow, updateShowcaseAssetWorkflow } from "../../../../../workflows/showcase"

// POST /admin/showcase/assets/:id: rename, or set a video's still.
export const POST = async (req: AuthenticatedMedusaRequest<{ name?: string; poster_url?: string | null }>, res: MedusaResponse) => {
  const { result } = await updateShowcaseAssetWorkflow(req.scope).run({ input: { id: req.params.id, ...req.validatedBody } })
  res.json({ asset: result })
}

// DELETE /admin/showcase/assets/:id: only when nothing uses it.
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await deleteShowcaseAssetWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, deleted: true })
}
