import Link from "next/link"
import { Fragment } from "react"
import { getProductCards } from "@/lib/data"
import { formatPrice } from "@/lib/format"
import { FillMedia } from "./media"

// A news article's HTML, with its blocks drawn in: product cards and chess diagrams (added
// with the editor's 🛒 and ♞ buttons, stored as empty <div>s with data attributes).

const BLOCK = /<div (data-t64-(?:product|fen)="[^"]*"[^>]*)><\/div>/g
const attr = (s: string, name: string) => {
  const m = s.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : null
}

const PIECES: Record<string, string> = { p: "bP", n: "bN", b: "bB", r: "bR", q: "bQ", k: "bK", P: "wP", N: "wN", B: "wB", R: "wR", Q: "wQ", K: "wK" }

// A static board from the piece placement part of a FEN.
export function ChessDiagram({ fen, caption }: { fen: string; caption?: string | null }) {
  const squares: { x: number; y: number; piece: string | null }[] = []
  fen.split("/").forEach((rank, y) => {
    let x = 0
    for (const ch of rank) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) squares.push({ x: x++, y, piece: null })
      } else squares.push({ x: x++, y, piece: PIECES[ch] ?? null })
    }
  })
  const files = "abcdefgh"
  return (
    <figure className="mx-auto my-8 w-full max-w-[440px]">
      <svg viewBox="0 0 8 8" role="img" aria-label={caption || "Chess position"} className="block w-full overflow-hidden rounded-md">
        {squares.map((s) => (
          <g key={`${s.x}${s.y}`}>
            <rect x={s.x} y={s.y} width={1} height={1} fill={(s.x + s.y) % 2 ? "#b58863" : "#f0d9b5"} />
            {s.piece && <image href={`/pieces/classic/${s.piece}.svg`} x={s.x + 0.04} y={s.y + 0.04} width={0.92} height={0.92} />}
            {s.y === 7 && (
              <text x={s.x + 0.94} y={7.96} fontSize={0.2} textAnchor="end" fill={(s.x + s.y) % 2 ? "#f0d9b5" : "#b58863"} fontWeight={700}>
                {files[s.x]}
              </text>
            )}
            {s.x === 0 && (
              <text x={0.05} y={s.y + 0.22} fontSize={0.2} fill={(s.x + s.y) % 2 ? "#f0d9b5" : "#b58863"} fontWeight={700}>
                {8 - s.y}
              </text>
            )}
          </g>
        ))}
      </svg>
      {caption && <figcaption className="g-muted mt-2 text-center text-[15px]">{caption}</figcaption>}
    </figure>
  )
}

async function ArticleProduct({ handle, title }: { handle: string; title: string | null }) {
  const p = (await getProductCards()).find((x) => x.handle === handle)
  if (!p) return null
  return (
    <aside className="my-8">
      <Link href={`/products/${p.handle}`} className="group flex items-center gap-4 rounded-lg border border-[var(--g-line)] bg-[var(--g-panel)] p-3 hover:border-[var(--g-accent)]">
        <span className="relative block h-[96px] w-[96px] shrink-0 overflow-hidden rounded-md bg-[var(--g-panel-2)]">
          {p.thumbnail && <FillMedia src={p.thumbnail} sizes="96px" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight group-hover:underline">{p.title || title}</span>
          <span className="g-muted mt-1 block text-[15px]">
            {p.price != null ? (p.maxPrice && p.maxPrice > p.price ? `From ${formatPrice(p.price)}` : formatPrice(p.price)) : ""}
            {!p.inStock && " · Sold out"}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-[var(--g-accent)] px-4 py-2 text-[14px] font-semibold text-black">View</span>
      </Link>
    </aside>
  )
}

export function ArticleBody({ html, className }: { html: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of html.matchAll(BLOCK)) {
    const before = html.slice(last, m.index)
    if (before.trim()) parts.push(<div key={`h${i}`} className={className} dangerouslySetInnerHTML={{ __html: before }} />)
    const handle = attr(m[1], "data-t64-product")
    const fen = attr(m[1], "data-t64-fen")
    if (handle) parts.push(<ArticleProduct key={`p${i}`} handle={handle} title={attr(m[1], "data-t64-title")} />)
    else if (fen && /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8}$/.test(fen)) parts.push(<ChessDiagram key={`b${i}`} fen={fen} caption={attr(m[1], "data-t64-caption")} />)
    last = (m.index ?? 0) + m[0].length
    i++
  }
  const rest = html.slice(last)
  if (rest.trim() || !parts.length) parts.push(<div key="end" className={className} dangerouslySetInnerHTML={{ __html: rest }} />)
  return <Fragment>{parts}</Fragment>
}
