import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SEO_MODULE } from "../../../modules/seo"
import type SeoModuleService from "../../../modules/seo/service"

// Where each kind of page lives on the website.
const ROUTES: Record<string, { entity: string; path: (handle: string) => string }> = {
  news: { entity: "news_article", path: (h) => `/play/news/${h}` },
  post: { entity: "post", path: (h) => `/blog/${h}` },
  tournament: { entity: "tournament", path: (h) => `/tournaments/${h}` },
  page: { entity: "page", path: (h) => `/help/${h}` },
}

// GET /store/seo: every page's custom search settings, by web address ("/play/news/x" →
// values), for page titles, descriptions, share pictures and the sitemap. Products carry
// theirs themselves.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const seo: SeoModuleService = req.scope.resolve(SEO_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const rows = await seo.listSeoMetas({}, { take: 5000 })
  const pages: Record<string, { title: string | null; description: string | null; image_url: string | null; noindex: boolean }> = {}
  const value = (r: (typeof rows)[number]) => ({ title: r.title, description: r.description, image_url: r.image_url, noindex: r.noindex })

  for (const r of rows) if (r.target_type === "static") pages[r.target_key] = value(r)
  for (const [type, route] of Object.entries(ROUTES)) {
    const mine = rows.filter((r) => r.target_type === type)
    if (!mine.length) continue
    const { data } = await query.graph({ entity: route.entity, fields: ["id", "handle"], filters: { id: mine.map((r) => r.target_key) } })
    const handles = new Map((data as { id: string; handle: string }[]).map((d) => [d.id, d.handle]))
    for (const r of mine) {
      const h = handles.get(r.target_key)
      if (h) pages[route.path(h)] = value(r)
    }
  }
  res.set("Cache-Control", "public, max-age=30")
  res.json({ pages })
}
