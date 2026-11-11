import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { BLOG_MODULE } from "../modules/blog"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { NEWS_MODULE } from "../modules/news"
import { periodOf, searchReport, viewsByPage } from "./analytics"
import { loadGsc, report as gscReport } from "./search-console"

// Content (admin → Content): the plan of articles (calendar and ideas), ideas from what people
// search for, and how each article does.

export const IDEAS_KEY = "content_ideas"

export type Idea = {
  id: string
  title: string
  notes: string
  // Planned day (YYYY-MM-DD) or none.
  date: string | null
  kind: "blog" | "news" | "social" | "other"
  status: "idea" | "writing" | "done"
  source: string | null
  created_at: string
}

export const newIdeaId = () => `idea_${crypto.randomBytes(6).toString("hex")}`

export const loadIdeas = async (c: MedusaContainer): Promise<Idea[]> => {
  const content: ContentModuleService = c.resolve(CONTENT_MODULE)
  const v = (await content.getSettingValue(IDEAS_KEY)) as { ideas?: Idea[] } | null
  return Array.isArray(v?.ideas) ? v.ideas : []
}

type Listable = { [k: string]: (filters: object, config: object) => Promise<unknown[]> }
type Article = { id: string; title: string; handle: string; status: "draft" | "published"; published_at: Date | string | null; created_at: Date | string; updated_at: Date | string }

export const loadArticles = async (c: MedusaContainer) => {
  const blog = c.resolve(BLOG_MODULE) as unknown as Listable
  const news = c.resolve(NEWS_MODULE) as unknown as Listable
  const select = ["id", "title", "handle", "status", "published_at", "created_at", "updated_at"]
  const [posts, articles] = await Promise.all([
    blog.listPosts({}, { select, take: 2000, order: { created_at: "DESC" } }) as Promise<Article[]>,
    news.listNewsArticles({}, { select, take: 2000, order: { created_at: "DESC" } }) as Promise<Article[]>,
  ])
  const view = (kind: "blog" | "news") => (a: Article) => ({
    id: a.id,
    kind,
    title: a.title,
    path: kind === "blog" ? `/blog/${a.handle}` : `/play/news/${a.handle}`,
    edit: kind === "blog" ? `/website/blog?edit=${a.id}` : `/website/news?edit=${a.id}`,
    status: a.status === "published" && a.published_at && new Date(a.published_at) > new Date() ? ("scheduled" as const) : a.status,
    published_at: a.published_at ? new Date(a.published_at).toISOString() : null,
    updated_at: new Date(a.updated_at).toISOString(),
  })
  return [...posts.map(view("blog")), ...articles.map(view("news"))]
}

// Each article's visits (the store's own count) and Google results (when Search Console is
// connected), over the last `days` days.
export const articlePerformance = async (c: MedusaContainer, days: number) => {
  const articles = (await loadArticles(c)).filter((a) => a.status === "published")
  const views = await viewsByPage(c, periodOf(days), ["/blog/", "/play/news/"])
  let google: Map<string, { clicks: number; impressions: number; position: number }> | null = null
  let googleError: string | null = null
  const gsc = await loadGsc(c)
  if (gsc.refresh_enc && gsc.site_url) {
    try {
      const r = await gscReport(c, gsc, Math.max(7, Math.min(90, days)))
      google = new Map(r.pages.map((p) => [new URL(p.key).pathname.replace(/\/$/, ""), { clicks: p.clicks, impressions: p.impressions, position: p.position }]))
    } catch (e) {
      googleError = (e as Error).message
    }
  }
  return {
    google_connected: !!google,
    google_error: googleError,
    articles: articles
      .map((a) => ({ ...a, ...(views.get(a.path) ?? { views: 0, visits: 0 }), google: google?.get(a.path) ?? null }))
      .sort((x, y) => y.views - x.views),
  }
}

// Ideas from what people look for: shop searches that found nothing, the most searched words,
// and Google searches where the site shows up but low on the page.
export const ideaSources = async (c: MedusaContainer) => {
  const s = await searchReport(c, periodOf(90))
  let google: { query: string; impressions: number; clicks: number; position: number }[] = []
  const gsc = await loadGsc(c)
  if (gsc.refresh_enc && gsc.site_url) {
    try {
      const r = await gscReport(c, gsc, 28)
      google = r.queries
        .filter((q) => q.position > 5 && q.impressions >= 5)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 30)
        .map((q) => ({ query: q.key, impressions: q.impressions, clicks: q.clicks, position: q.position }))
    } catch {
      // Not available right now.
    }
  }
  return {
    nothing_found: s.nothing_found.slice(0, 30).map((t) => ({ term: t.term, searches: t.searches })),
    most_searched: s.terms.slice(0, 30).map((t) => ({ term: t.term, searches: t.searches })),
    google,
    google_connected: !!(gsc.refresh_enc && gsc.site_url),
  }
}
