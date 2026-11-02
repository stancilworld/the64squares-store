import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/pages: titles and handles of published pages (for footer and menus).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pages } = await query.graph({
    entity: "page",
    fields: ["handle", "title", "rank"],
    filters: { is_published: true },
  })
  pages.sort((a, b) => a.rank - b.rank)
  res.json({ pages })
}
