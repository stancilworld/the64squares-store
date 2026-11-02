import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPostWorkflow } from "../../../workflows/post"
import type { PostBodyType } from "../validators"

// GET /admin/posts: every post, drafts included, newest first.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: posts } = await query.graph({
    entity: "post",
    fields: ["*"],
  })
  const time = (p: { published_at?: Date | string | null; created_at: Date | string }) =>
    new Date(p.published_at ?? p.created_at).getTime()
  posts.sort((a, b) => time(b) - time(a))
  res.json({ posts })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBodyType>,
  res: MedusaResponse
) => {
  const { result } = await createPostWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({ post: result })
}
