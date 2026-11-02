import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPageWorkflow } from "../../../workflows/page"
import type { PageBodyType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pages } = await query.graph({
    entity: "page",
    fields: ["*"],
  })
  pages.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
  res.json({ pages })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PageBodyType>,
  res: MedusaResponse
) => {
  const { result } = await createPageWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({ page: result })
}
