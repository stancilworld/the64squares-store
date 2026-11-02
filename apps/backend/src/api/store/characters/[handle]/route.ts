import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// GET /store/characters/:handle: one character with linked product ids.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "character",
    fields: ["*", "products.id"],
    filters: { handle: req.params.handle },
  })
  const character = data[0]
  if (!character) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Character not found")
  }
  const { products, ...rest } = character
  res.json({
    character: {
      ...rest,
      product_ids: (products ?? []).filter(Boolean).map((p) => p!.id),
    },
  })
}
