import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  deleteCharacterWorkflow,
  updateCharacterWorkflow,
} from "../../../../workflows/character"
import type { UpdateCharacterBodyType } from "../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "character",
    fields: ["*", "products.id", "products.title", "products.thumbnail"],
    filters: { id: req.params.id },
  })
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Character not found")
  }
  res.json({ character: data[0] })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateCharacterBodyType>,
  res: MedusaResponse
) => {
  const { result } = await updateCharacterWorkflow(req.scope).run({
    input: { id: req.params.id, data: req.validatedBody },
  })
  res.json({ character: result })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await deleteCharacterWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, object: "character", deleted: true })
}
