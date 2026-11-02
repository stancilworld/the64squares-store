import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isShowing, publicBlock, withDraft } from "../../../lib/content-drafts"
import { isPreview } from "../../../lib/preview"

// GET /store/content?page=home: the content blocks on the website now, in display order.
// In preview (staff only), drafts are shown as if published, plus items scheduled to start.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const page = typeof req.query.page === "string" ? req.query.page : "home"
  const preview = isPreview(req)
  const { data } = await query.graph({
    entity: "content_block",
    fields: ["*"],
    filters: { page },
  })
  const now = Date.now()
  const blocks = data
    .map((b) => (preview ? withDraft(b) : b))
    .filter((b) => isShowing(b, now, preview))
    .sort((a, b) => a.rank - b.rank)
    .map(publicBlock)
  res.set("Cache-Control", "no-store")
  res.json({ blocks, preview })
}
