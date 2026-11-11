import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isPreview } from "../../../lib/preview"
import { excerptFrom } from "../../../lib/news-html"

// GET /store/news?limit=12&offset=0&topic=Tournaments: published articles, newest first, plus
// the topics in use (with counts) for the topic list. An article dated in the future is
// scheduled: hidden until then. Preview shows drafts and scheduled articles too.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const topic = typeof req.query.topic === "string" && req.query.topic ? req.query.topic : null
  const preview = isPreview(req)
  const live = preview ? {} : { status: "published", $or: [{ published_at: null }, { published_at: { $lte: new Date() } }] }

  const { data: articles, metadata } = await query.graph({
    entity: "news_article",
    fields: ["title", "handle", "excerpt", "body_html", "cover_url", "topic", "author", "featured", "published_at", "status"],
    filters: (topic ? { ...live, topic } : live) as never,
    pagination: { skip: offset, take: limit, order: { published_at: "DESC" } },
  })
  const { data: all } = await query.graph({ entity: "news_article", fields: ["topic"], filters: live as never })
  const counts = new Map<string, number>()
  for (const a of all as { topic: string }[]) counts.set(a.topic, (counts.get(a.topic) ?? 0) + 1)

  res.set("Cache-Control", "no-store")
  res.json({
    articles: (articles as Record<string, unknown>[]).map(({ body_html, ...a }) => ({
      ...a,
      excerpt: (a.excerpt as string | null) || excerptFrom(String(body_html ?? "")),
    })),
    topics: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    count: metadata?.count ?? articles.length,
    limit,
    offset,
  })
}
