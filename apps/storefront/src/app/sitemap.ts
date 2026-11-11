import type { MetadataRoute } from "next"
import { getNews, getPosts, getProductCards } from "@/lib/data"
import { getSeoPages } from "@/lib/seo"
import { getTournaments } from "@/lib/tournaments"
import { SITE_URL } from "@/lib/site"

const HELP = ["delivery", "returns-and-warranty", "faqs", "privacy", "terms"]

// The list of pages Google should know about. Updates by itself as products
// blog posts and tournaments are added in the admin.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const safe = async <T,>(p: Promise<T>, fallback: T) => {
    try {
      return await p
    } catch {
      return fallback
    }
  }
  const [products, posts, tournaments, news, seo] = await Promise.all([
    safe(getProductCards(), []),
    safe(getPosts(200), { posts: [], count: 0 }),
    safe(getTournaments(), { upcoming: [], past: [] }),
    safe(getNews(60), { articles: [], topics: [], count: 0 }),
    safe(getSeoPages(), {}),
  ])
  const url = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    priority,
  })
  const all = [
    url("", 1),
    url("/shop", 0.9),
    url("/about", 0.6),
    url("/blog", 0.6),
    url("/tournaments", 0.8),
    url("/contact", 0.5),
    ...products.map((p) => url(`/products/${p.handle}`, 0.8)),
    ...posts.posts.map((p) => url(`/blog/${p.handle}`, 0.5)),
    ...[...tournaments.upcoming, ...tournaments.past].map((t) => url(`/tournaments/${t.handle}`, 0.7)),
    ...HELP.map((h) => url(`/help/${h}`, 0.3)),
    url("/play", 0.8),
    url("/play/online", 0.6),
    url("/play/puzzles", 0.7),
    url("/play/leaderboard", 0.4),
    url("/play/leaderboard/fide", 0.5),
    url("/play/news", 0.6),
    ...news.articles.map((a) => ({ ...url(`/play/news/${a.handle}`, 0.6), ...(a.published_at ? { lastModified: a.published_at } : {}) })),
  ]
  // Pages set to "Don't show in search" in the admin are left out.
  return all.filter((e) => !seo[e.url.slice(SITE_URL.length) || "/"]?.noindex)
}
