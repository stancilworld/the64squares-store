import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/team-members: the faces shown in "Meet our team" on About us, in display order.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "team_member",
    fields: [
      "id",
      "name",
      "role",
      "image_url",
      "color_image_url",
      "canvas_width",
      "canvas_height",
      "box",
      "mask",
      "rank",
    ],
    filters: { is_active: true },
  })
  data.sort((a, b) => a.rank - b.rank)
  res.json({ team_members: data.filter((m) => m.image_url) })
}
