import { Node, mergeAttributes } from "@tiptap/react"

// Blocks for news articles: a product card and a chess diagram. Stored as empty <div>s with
// data attributes; the website draws the real card and board.

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    articleBlocks: {
      insertProductCard: (handle: string, title?: string) => ReturnType
      insertChessBoard: (fen: string, caption?: string) => ReturnType
    }
  }
}

export const HANDLE = /^[a-z0-9][a-z0-9-]{0,119}$/
// Piece placement only (the first part of a FEN), eight ranks.
export const boardOf = (input: string) => {
  const placement = input.trim().split(/\s+/)[0] ?? ""
  const ranks = placement.split("/")
  if (ranks.length !== 8) return null
  for (const r of ranks) {
    let n = 0
    for (const ch of r) {
      if (/[1-8]/.test(ch)) n += Number(ch)
      else if (/[pnbrqkPNBRQK]/.test(ch)) n += 1
      else return null
    }
    if (n !== 8) return null
  }
  return placement
}

const label = (dom: HTMLElement, icon: string, text: string, sub: string) => {
  dom.setAttribute("contenteditable", "false")
  dom.style.cssText = "display:flex;gap:12px;align-items:center;border:1px dashed var(--border-strong);border-radius:8px;padding:12px 14px;background:var(--bg-subtle);margin:1em 0;font-size:14px"
  dom.innerHTML = ""
  const i = document.createElement("span")
  i.textContent = icon
  i.style.fontSize = "22px"
  const t = document.createElement("span")
  const b = document.createElement("strong")
  b.textContent = text
  const s = document.createElement("span")
  s.textContent = sub
  s.style.cssText = "display:block;color:var(--fg-subtle);font-size:12px;word-break:break-all"
  t.append(b, s)
  dom.append(i, t)
}

export const ProductCardBlock = Node.create({
  name: "productCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      handle: { default: "", parseHTML: (el) => el.getAttribute("data-t64-product") ?? "" },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-t64-title") ?? "" },
    }
  },
  parseHTML: () => [{ tag: "div[data-t64-product]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ "data-t64-product": HTMLAttributes.handle, "data-t64-title": HTMLAttributes.title || undefined })],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      label(dom, "🛒", node.attrs.title || "Product card", `Shows the product's photo, price and a link: /products/${node.attrs.handle}`)
      return { dom }
    }
  },
  addCommands() {
    return {
      insertProductCard:
        (handle, title) =>
        ({ commands }) =>
          HANDLE.test(handle) && commands.insertContent({ type: this.name, attrs: { handle, title: title ?? "" } }),
    }
  },
})

export const ChessBoardBlock = Node.create({
  name: "chessBoard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      fen: { default: "", parseHTML: (el) => el.getAttribute("data-t64-fen") ?? "" },
      caption: { default: "", parseHTML: (el) => el.getAttribute("data-t64-caption") ?? "" },
    }
  },
  parseHTML: () => [{ tag: "div[data-t64-fen]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ "data-t64-fen": HTMLAttributes.fen, "data-t64-caption": HTMLAttributes.caption || undefined })],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      label(dom, "♞", node.attrs.caption || "Chess diagram", node.attrs.fen)
      return { dom }
    }
  },
  addCommands() {
    return {
      insertChessBoard:
        (fen, caption) =>
        ({ commands }) => {
          const placement = boardOf(fen)
          return !!placement && commands.insertContent({ type: this.name, attrs: { fen: placement, caption: (caption ?? "").slice(0, 200) } })
        },
    }
  },
})
