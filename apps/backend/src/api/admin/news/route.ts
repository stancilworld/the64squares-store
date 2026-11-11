import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createNewsWorkflow } from "../../../workflows/news"
import type { NewsBodyType } from "../validators"

// GET /admin/news: every article, drafts included, newest first.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: articles } = await query.graph({ entity: "news_article", fields: ["*"] })
  const time = (a: { published_at?: Date | string | null; created_at: Date | string }) => new Date(a.published_at ?? a.created_at).getTime()
  articles.sort((a, b) => time(b) - time(a))
  res.json({ articles })
}

export const POST = async (req: AuthenticatedMedusaRequest<NewsBodyType>, res: MedusaResponse) => {
  const { result } = await createNewsWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ article: result })
}
