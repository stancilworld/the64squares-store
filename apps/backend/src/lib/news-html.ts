import sanitizeHtml from "sanitize-html"

// News articles are written in a rich editor and stored as HTML. Before saving, the HTML is
// cleaned to what the editor can produce, so nothing pasted in (scripts, tracking pixels,
// inline event handlers, foreign styles) reaches the website.

const ALIGN = /^(left|right|center|justify)$/
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\))$/i

export const cleanArticleHtml = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "span", "a",
      "ul", "ol", "li", "blockquote", "code", "pre", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col", "div", "iframe",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      iframe: ["src", "width", "height", "allowfullscreen", "frameborder"],
      th: ["colspan", "rowspan", "colwidth"],
      td: ["colspan", "rowspan", "colwidth"],
      col: ["style"],
      ol: ["start"],
      mark: ["data-color", "style"],
      span: ["style"],
      div: ["data-youtube-video", "data-t64-product", "data-t64-title", "data-t64-fen", "data-t64-caption"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": { "text-align": [ALIGN], color: [COLOUR], "background-color": [COLOUR] },
      col: { width: [/^\d+px$/], "min-width": [/^\d+px$/] },
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    // Pictures are uploaded by the editor; pasted-in data: pictures are dropped.
    allowedSchemesByTag: { img: ["https", "http"] },
    // Only YouTube embeds (the editor's video button).
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com"],
    transformTags: {
      // Links to other sites open in a new tab.
      a: (_tag, given) => {
        const href = given.href ?? ""
        const attribs: sanitizeHtml.Attributes = /^https?:/i.test(href) ? { href, target: "_blank", rel: "noopener noreferrer" } : { href }
        return { tagName: "a", attribs }
      },
      h1: "h2",
      // Article blocks (product card, chess diagram): only well-formed values are kept.
      div: (_tag, given) => {
        const attribs: sanitizeHtml.Attributes = {}
        if ("data-youtube-video" in given) attribs["data-youtube-video"] = ""
        const handle = given["data-t64-product"]
        if (handle && /^[a-z0-9][a-z0-9-]{0,119}$/.test(handle)) {
          attribs["data-t64-product"] = handle
          if (given["data-t64-title"]) attribs["data-t64-title"] = given["data-t64-title"].slice(0, 200)
        }
        const fen = given["data-t64-fen"]
        if (fen && /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8}$/.test(fen)) {
          attribs["data-t64-fen"] = fen
          if (given["data-t64-caption"]) attribs["data-t64-caption"] = given["data-t64-caption"].slice(0, 200)
        }
        return { tagName: "div", attribs }
      },
    },
    // Pictures and videos whose address was removed above.
    exclusiveFilter: (frame) => (frame.tag === "img" || frame.tag === "iframe") && !frame.attribs.src,
  })

// A plain-text summary, for when no excerpt was written.
export const excerptFrom = (html: string, max = 200) => {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text
}
