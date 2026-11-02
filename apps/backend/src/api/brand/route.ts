import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /brand: the logo uploaded in the admin (Branding page). Public, because the admin
// sign-in page shows it before anyone is logged in. null means "use the built-in logo".
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: blocks } = await query.graph({
    entity: "content_block",
    fields: ["image_url", "rank"],
    filters: { page: "site", section: "admin_logo", is_active: true },
  })
  blocks.sort((a, b) => a.rank - b.rank)
  res.set("Cache-Control", "no-store")
  res.json({ logo_url: blocks.find((b) => b.image_url)?.image_url ?? null })
}
