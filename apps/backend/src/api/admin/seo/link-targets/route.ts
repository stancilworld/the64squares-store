import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadSeoPages } from "../../../../lib/seo-pages"

// Words that, when they appear in an article, suggest linking to one of the site's pages.
const EXTRA: { path: string; label: string; phrases: string[] }[] = [
  { path: "/play/online", label: "Play online", phrases: ["play chess online", "play online", "online chess"] },
  { path: "/play/puzzles", label: "Puzzles", phrases: ["chess puzzles", "puzzles", "tactics"] },
  { path: "/play/computer", label: "Play the computer", phrases: ["play the computer", "against the computer"] },
  { path: "/tournaments", label: "Tournaments", phrases: ["tournaments", "tournament"] },
  { path: "/play/leaderboard", label: "Leaderboard", phrases: ["leaderboard"] },
  { path: "/shop", label: "Shop", phrases: ["chess sets", "chess boards", "chess pieces"] },
]

// GET /admin/seo/link-targets: pages an article could link to, with the words that suggest each.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const pages = await loadSeoPages(req.scope)
  const targets = pages
    .filter((p) => p.status === "live" && p.type !== "static" && !p.seo.noindex)
    .map((p) => ({
      path: p.path,
      label: p.label,
      type: p.type,
      phrases: [...new Set([p.seo.keyword, p.label].filter((x): x is string => !!x && x.trim().length >= 4).map((x) => x.trim()))],
    }))
  res.json({ targets: [...targets, ...EXTRA.map((e) => ({ ...e, type: "static" }))] })
}
