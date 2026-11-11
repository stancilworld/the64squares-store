import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { aiConnected } from "../../../lib/ai-writer"
import { loadArticles, loadIdeas } from "../../../lib/content-hub"

// GET /admin/content-hub: every blog post and news article (with dates and status), the
// saved ideas, and whether the writing helper has an AI key.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const [articles, ideas, ai] = await Promise.all([loadArticles(req.scope), loadIdeas(req.scope), aiConnected(req.scope)])
  res.json({ articles, ideas, ai_connected: ai })
}
