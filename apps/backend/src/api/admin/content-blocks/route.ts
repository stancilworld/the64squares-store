import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createContentBlockWorkflow } from "../../../workflows/content-block"
import type { ContentBlockBodyType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const page = typeof req.query.page === "string" ? req.query.page : "home"
  const { data: blocks } = await query.graph({
    entity: "content_block",
    fields: ["*"],
    filters: { page },
  })
  blocks.sort((a, b) => a.rank - b.rank)
  res.json({ content_blocks: blocks })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<ContentBlockBodyType>,
  res: MedusaResponse
) => {
  const { result } = await createContentBlockWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({ content_block: result })
}
