// SEO checks, like Yoast's: what a page shows in Google and when shared, and whether its
// focus keyword is used well. Pure functions, used by the health page and the admin panel.

export type SeoInput = {
  // What Google shows as the title / description (after defaults are applied).
  title: string
  description: string
  // Web address path, e.g. /products/walnut-board.
  path: string
  // The page's main text (HTML or plain), for length and keyword checks.
  html: string
  keyword: string | null
  // A picture for link previews (share image or cover).
  image: string | null
  noindex: boolean
}

export type Check = { id: string; level: "good" | "ok" | "bad"; text: string }

const plain = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

const words = (text: string) => (text ? text.split(/\s+/).filter(Boolean).length : 0)
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim()
const has = (hay: string, needle: string) => !!needle && ` ${norm(hay)} `.includes(` ${norm(needle)} `)

export const TITLE_MAX = 60
export const DESC_MIN = 70
export const DESC_MAX = 160

export const auditSeo = (p: SeoInput): Check[] => {
  const out: Check[] = []
  const text = plain(p.html)
  const n = words(text)
  const tl = p.title.trim().length
  const dl = p.description.trim().length

  if (p.noindex) out.push({ id: "noindex", level: "ok", text: "Hidden from Google (\"Don't show in search\" is on)." })

  if (!tl) out.push({ id: "title", level: "bad", text: "No title." })
  else if (tl > TITLE_MAX) out.push({ id: "title", level: "ok", text: `Title is ${tl} letters; Google cuts it after about ${TITLE_MAX}.` })
  else if (tl < 25) out.push({ id: "title", level: "ok", text: `Title is short (${tl} letters); 40–60 uses the space better.` })
  else out.push({ id: "title", level: "good", text: "Title length is good." })

  if (!dl) out.push({ id: "description", level: "bad", text: "No description: Google will pick some text from the page." })
  else if (dl < DESC_MIN) out.push({ id: "description", level: "ok", text: `Description is short (${dl} letters); aim for ${DESC_MIN}–${DESC_MAX}.` })
  else if (dl > DESC_MAX) out.push({ id: "description", level: "ok", text: `Description is ${dl} letters; Google cuts it after about ${DESC_MAX}.` })
  else out.push({ id: "description", level: "good", text: "Description length is good." })

  if (!p.image) out.push({ id: "image", level: "ok", text: "No share picture: links shared on WhatsApp or Facebook will show without one." })
  else out.push({ id: "image", level: "good", text: "Has a share picture." })

  if (text) {
    if (n < 150) out.push({ id: "length", level: "ok", text: `Only ${n} words of text. Pages with more useful text tend to rank better.` })
    else out.push({ id: "length", level: "good", text: `${n} words of text.` })
    const imgs = [...p.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    const noAlt = imgs.filter((i) => !/\balt="[^"]+"/i.test(i)).length
    if (noAlt) out.push({ id: "alt", level: "ok", text: `${noAlt} picture${noAlt === 1 ? " has" : "s have"} no description (alt text) for Google and screen readers.` })
    const links = (p.html.match(/<a\b[^>]*href="\/(?!\/)/gi) ?? []).length
    if (n >= 300 && !links) out.push({ id: "links", level: "ok", text: "No links to other pages of your site. Link to related products or articles." })
  }

  const k = p.keyword?.trim()
  if (!k) {
    out.push({ id: "keyword", level: "ok", text: "No focus keyword: add the search you want this page to be found for." })
  } else {
    out.push(
      has(p.title, k)
        ? { id: "kw-title", level: "good", text: "Focus keyword is in the title." }
        : { id: "kw-title", level: "bad", text: "Focus keyword isn't in the title." }
    )
    out.push(
      has(p.description, k)
        ? { id: "kw-desc", level: "good", text: "Focus keyword is in the description." }
        : { id: "kw-desc", level: "ok", text: "Focus keyword isn't in the description." }
    )
    const slug = norm(p.path.replace(/[-/]/g, " "))
    out.push(
      ` ${slug} `.includes(` ${norm(k)} `) || norm(k).split(" ").every((w) => slug.includes(w))
        ? { id: "kw-url", level: "good", text: "Focus keyword is in the web address." }
        : { id: "kw-url", level: "ok", text: "Focus keyword isn't in the web address." }
    )
    if (text) {
      const first = plain((p.html.match(/<p\b[\s\S]*?<\/p>/i) ?? [p.html])[0]).slice(0, 400) || text.slice(0, 400)
      out.push(
        has(first, k)
          ? { id: "kw-intro", level: "good", text: "Focus keyword is in the first paragraph." }
          : { id: "kw-intro", level: "ok", text: "Use the focus keyword in the first paragraph." }
      )
      const count = (` ${norm(text)} `.match(new RegExp(` ${norm(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "g")) ?? []).length
      const density = n ? (count * words(k)) / n : 0
      if (!count) out.push({ id: "kw-density", level: "bad", text: "Focus keyword isn't in the text." })
      else if (density > 0.03) out.push({ id: "kw-density", level: "ok", text: `Focus keyword used ${count} times: a bit much, write naturally.` })
      else out.push({ id: "kw-density", level: "good", text: `Focus keyword used ${count} time${count === 1 ? "" : "s"} in the text.` })
    }
  }
  return out
}

// One summary for a page: the worst level among its checks.
export const scoreOf = (checks: Check[]): Check["level"] => {
  if (checks.some((c) => c.level === "bad")) return "bad"
  if (checks.filter((c) => c.level === "ok").length > 2) return "ok"
  return "good"
}
