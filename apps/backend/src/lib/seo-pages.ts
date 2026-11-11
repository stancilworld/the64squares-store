import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SEO_MODULE } from "../modules/seo"
import type SeoModuleService from "../modules/seo/service"
import { auditSeo, type Check, scoreOf } from "./seo-audit"
import { loadSeoSettings } from "./seo-settings"

// Every page the SEO tools look after, with what Google sees for it (custom SEO, or the
// defaults the website falls back to) and its checks.

export type SeoTargetType = "product" | "news" | "post" | "tournament" | "page" | "static"

export type SeoPage = {
  type: SeoTargetType
  key: string
  label: string
  path: string
  // Custom values (null = the website's default is used).
  seo: { title: string | null; description: string | null; image_url: string | null; keyword: string | null; noindex: boolean }
  // What Google actually gets, and what the website falls back to when a field is empty.
  effective: { title: string; description: string; image: string | null }
  defaults: { title: string; description: string; image: string | null }
  // The page's text, for the keyword checks.
  html: string
  status: "live" | "draft"
  checks: Check[]
  score: Check["level"]
  edit_url: string | null
}

const SITE = "The 64 Squares"

// Fixed pages: their paths, and the titles and descriptions the website gives them.
const SITE_DESCRIPTION = "Premium chess sets, boards, pieces and clocks, made in India. Play online and join tournaments."
export const STATIC_PAGES: { path: string; label: string; title: string; description?: string }[] = [
  { path: "/", label: "Home", title: `${SITE} | Premium chess sets, boards & tournaments` },
  { path: "/shop", label: "Shop", title: `Shop | ${SITE}`, description: "Chess sets, boards, pieces and clocks, handmade in India. Free shipping on larger orders." },
  { path: "/about", label: "About", title: `About us | ${SITE}` },
  { path: "/contact", label: "Contact", title: `Contact | ${SITE}`, description: "Get in touch with The 64 Squares: email, WhatsApp or send us a message." },
  { path: "/blog", label: "Journal", title: `${SITE} Journal` },
  {
    path: "/tournaments",
    label: "Tournaments",
    title: `Tournaments | ${SITE}`,
    description: "Online arenas and over-the-board chess tournaments from The 64 Squares. Register in a minute and get your ticket by email.",
  },
  {
    path: "/play",
    label: "Play chess",
    title: `Play chess online | ${SITE}`,
    description: "Play chess on The 64 Squares: rated games online, eight computer levels, games with friends, and free online tournaments.",
  },
  { path: "/play/news", label: "News", title: `News | ${SITE}`, description: "Tournament results, club news and announcements from The 64 Squares." },
  { path: "/play/puzzles", label: "Puzzles", title: `Chess puzzles | ${SITE}`, description: "Daily chess puzzle, rated puzzle trainer, Puzzle Rush and tactics by theme." },
  { path: "/play/leaderboard", label: "Leaderboard", title: `Leaderboard | ${SITE}`, description: "The top-rated chess players on The 64 Squares." },
]

const trimText = (s: string | null | undefined, n = 160) => {
  const t = (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t
}

export const loadSeoPages = async (container: MedusaContainer): Promise<SeoPage[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const seo: SeoModuleService = container.resolve(SEO_MODULE)
  const [settings, metas, products, news, posts, tournaments, pages] = await Promise.all([
    loadSeoSettings(container),
    seo.listSeoMetas({}, { take: 5000 }),
    query.graph({ entity: "product", fields: ["id", "title", "handle", "description", "thumbnail", "status", "metadata"] }),
    query.graph({ entity: "news_article", fields: ["id", "title", "handle", "excerpt", "body_html", "cover_url", "status"] }),
    query.graph({ entity: "post", fields: ["id", "title", "handle", "excerpt", "body", "cover_url", "status"] }),
    query.graph({ entity: "tournament", fields: ["id", "title", "handle", "summary", "description", "image_url", "status"] }),
    query.graph({ entity: "page", fields: ["id", "title", "handle", "body", "is_published"] }),
  ])
  const meta = new Map(metas.map((m) => [`${m.target_type}:${m.target_key}`, m]))
  const out: SeoPage[] = []

  const add = (p: Omit<SeoPage, "checks" | "score" | "seo" | "effective" | "defaults"> & { html: string; custom?: Partial<SeoPage["seo"]>; title: string; description: string; image: string | null }) => {
    const m = meta.get(`${p.type}:${p.key}`)
    const seoVals = {
      title: p.custom?.title ?? m?.title ?? null,
      description: p.custom?.description ?? m?.description ?? null,
      image_url: p.custom?.image_url ?? m?.image_url ?? null,
      keyword: p.custom?.keyword ?? m?.keyword ?? null,
      noindex: p.custom?.noindex ?? m?.noindex ?? false,
    }
    const effective = {
      title: seoVals.title || p.title,
      description: seoVals.description || p.description,
      image: seoVals.image_url || p.image,
    }
    const checks = auditSeo({ ...effective, path: p.path, html: p.html, keyword: seoVals.keyword, noindex: seoVals.noindex })
    out.push({
      type: p.type,
      key: p.key,
      label: p.label,
      path: p.path,
      status: p.status,
      edit_url: p.edit_url,
      seo: seoVals,
      effective,
      defaults: { title: p.title, description: p.description, image: p.image },
      html: p.html,
      checks,
      score: scoreOf(checks),
    })
  }

  for (const s of STATIC_PAGES) {
    add({
      type: "static",
      key: s.path,
      label: s.label,
      path: s.path,
      status: "live",
      edit_url: null,
      html: "",
      title: s.title,
      description: s.description ?? (settings.default_description.trim() || SITE_DESCRIPTION),
      image: null,
    })
  }
  for (const p of products.data as Record<string, any>[]) {
    const md = (p.metadata ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    add({
      type: "product",
      key: p.id,
      label: p.title,
      path: `/products/${p.handle}`,
      status: p.status === "published" ? "live" : "draft",
      edit_url: `/products/${p.id}`,
      html: p.description ?? "",
      title: `${p.title} | ${SITE}`,
      description: trimText(p.description),
      image: p.thumbnail ?? null,
      custom: {
        title: str(md.seo_title),
        description: str(md.seo_description),
        image_url: str(md.seo_image),
        keyword: str(md.seo_keyword),
        noindex: md.seo_noindex === true,
      },
    })
  }
  for (const a of news.data as Record<string, any>[]) {
    add({ type: "news", key: a.id, label: a.title, path: `/play/news/${a.handle}`, status: a.status === "published" ? "live" : "draft", edit_url: "/website/news", html: a.body_html ?? "", title: `${a.title} | ${SITE}`, description: a.excerpt || trimText(a.body_html), image: a.cover_url ?? null })
  }
  for (const a of posts.data as Record<string, any>[]) {
    add({ type: "post", key: a.id, label: a.title, path: `/blog/${a.handle}`, status: a.status === "published" ? "live" : "draft", edit_url: "/website/blog", html: a.body ?? "", title: `${a.title} | ${SITE}`, description: a.excerpt || trimText(a.body), image: a.cover_url ?? null })
  }
  for (const t of tournaments.data as Record<string, any>[]) {
    add({ type: "tournament", key: t.id, label: t.title, path: `/tournaments/${t.handle}`, status: t.status === "published" || t.status === "completed" ? "live" : "draft", edit_url: `/tournaments/${t.id}`, html: t.description ?? "", title: `${t.title} | ${SITE}`, description: t.summary || trimText(t.description), image: t.image_url ?? null })
  }
  for (const p of pages.data as Record<string, any>[]) {
    add({ type: "page", key: p.id, label: p.title, path: `/help/${p.handle}`, status: p.is_published ? "live" : "draft", edit_url: "/website/help-pages", html: p.body ?? "", title: `${p.title} | ${SITE}`, description: trimText(p.body), image: null })
  }

  // The same title or description on two live pages confuses Google.
  const live = out.filter((p) => p.status === "live" && !p.seo.noindex)
  for (const field of ["title", "description"] as const) {
    const seen = new Map<string, SeoPage[]>()
    for (const p of live) {
      const v = p.effective[field].trim().toLowerCase()
      if (v) seen.set(v, [...(seen.get(v) ?? []), p])
    }
    for (const group of seen.values()) {
      if (group.length < 2) continue
      for (const p of group) {
        p.checks.push({ id: `dup-${field}`, level: "bad", text: `Same ${field} as ${group.length - 1} other page${group.length > 2 ? "s" : ""} (${group.find((g) => g !== p)!.label}).` })
        p.score = scoreOf(p.checks)
      }
    }
  }
  return out
}
