import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { setProductCharacterWorkflow } from "../../../../../workflows/character"
import type { ProductCharacterBodyType } from "../../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "character.id", "character.name"],
    filters: { id: req.params.id },
  })
  res.json({ character: (data[0] as any)?.character ?? null })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<ProductCharacterBodyType>,
  res: MedusaResponse
) => {
  await setProductCharacterWorkflow(req.scope).run({
    input: {
      product_id: req.params.id,
      character_id: req.validatedBody.character_id,
    },
  })
  res.json({ product_id: req.params.id, character_id: req.validatedBody.character_id })
}
