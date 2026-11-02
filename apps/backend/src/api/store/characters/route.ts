import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/characters: all characters in display order, with linked product ids.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: characters } = await query.graph({
    entity: "character",
    fields: [
      "id",
      "name",
      "handle",
      "greeting",
      "tagline",
      "story",
      "image_url",
      "banner_url",
      "collection_title",
      "status",
      "coming_soon_text",
      "rank",
      "products.id",
    ],
  })
  characters.sort((a, b) => a.rank - b.rank)
  res.json({
    characters: characters.map(({ products, ...c }) => ({
      ...c,
      product_ids: (products ?? []).filter(Boolean).map((p) => p!.id),
    })),
  })
}
