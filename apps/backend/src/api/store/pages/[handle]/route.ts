import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { isPreview } from "../../../../lib/preview"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "page",
    fields: ["handle", "title", "body", "updated_at"],
    filters: isPreview(req) ? { handle: req.params.handle } : { handle: req.params.handle, is_published: true },
  })
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Page not found")
  }
  res.json({ page: data[0] })
}
