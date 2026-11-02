import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createCharacterWorkflow } from "../../../workflows/character"
import type { CharacterBodyType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: characters } = await query.graph({
    entity: "character",
    fields: ["*", "products.id"],
  })
  characters.sort((a, b) => a.rank - b.rank)
  res.json({
    characters: characters.map(({ products, ...c }) => ({
      ...c,
      product_count: (products ?? []).filter(Boolean).length,
    })),
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CharacterBodyType>,
  res: MedusaResponse
) => {
  const { result } = await createCharacterWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({ character: result })
}
