import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { isPreview } from "../../../../lib/preview"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const preview = isPreview(req)
  const { data } = await query.graph({
    entity: "post",
    fields: ["title", "handle", "excerpt", "body", "thumbnail_url", "cover_url", "author", "published_at", "status"],
    filters: preview
      ? { handle: req.params.handle }
      : ({
          handle: req.params.handle,
          status: "published",
          $or: [{ published_at: null }, { published_at: { $lte: new Date() } }],
        } as never),
  })
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Post not found")
  }
  res.set("Cache-Control", "no-store")
  res.json({ post: data[0] })
}
