import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isPreview } from "../../../lib/preview"

// GET /store/posts?limit=3&offset=0: published posts, newest first. A post whose publish
// date is still in the future is scheduled: hidden until then. Preview shows drafts and
// scheduled posts too.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 50)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const preview = isPreview(req)
  const { data: posts, metadata } = await query.graph({
    entity: "post",
    fields: ["title", "handle", "excerpt", "thumbnail_url", "cover_url", "author", "published_at", "status"],
    filters: preview
      ? {}
      : ({ status: "published", $or: [{ published_at: null }, { published_at: { $lte: new Date() } }] } as never),
    pagination: { skip: offset, take: limit, order: { published_at: "DESC" } },
  })
  res.set("Cache-Control", "no-store")
  res.json({ posts, count: metadata?.count ?? posts.length, limit, offset })
}
