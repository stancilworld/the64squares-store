import Link from "next/link"
import type { ContentBlock } from "@/lib/types"
import { FillMedia } from "./media"

// Splits a heading after each ", " so "Every move, every board" sits on two lines.
export function headingLines(title: string | null) {
  return (title ?? "").split(/(?<=,)\s+/)
}

// Shown until a banner picture is uploaded in the admin (Website → Homepage).
const DEFAULT_IMAGE = "/images/home-hero.jpg"
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]

// The homepage banner: a green velvet panel with the words, edged like a board with its
// file letters, beside a full-height photo.
export function Hero({ block }: { block: ContentBlock }) {
  return (
    <section aria-label="Welcome" className="grid bg-velvet lg:min-h-[640px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-walnut sm:aspect-[16/9] lg:order-2 lg:aspect-auto">
        <FillMedia src={block.image_url || DEFAULT_IMAGE} sizes="(min-width: 1024px) 50vw, 100vw" priority />
      </div>

      <div className="flex flex-col text-white lg:order-1">
        <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 lg:py-16 xl:px-24">
          <h1 className="font-display h-hero max-w-[620px] text-balance">{block.title}</h1>
          {block.body && <p className="mt-5 max-w-[460px] text-[17px] leading-[1.6] text-maple-soft/90">{block.body}</p>}
          {block.link_url && (
            <div className="mt-8">
              <Link href={block.link_url} className="btn btn-light">
                {block.link_label || "Shop now"}
              </Link>
            </div>
          )}
        </div>
        {/* The files a to h, as printed along the edge of a board. */}
        <div aria-hidden="true" className="grid grid-cols-8 border-t border-white/10 px-6 sm:px-10 lg:px-16 xl:px-24">
          {FILES.map((f) => (
            <span key={f} className="py-3 text-center font-display text-[15px] italic text-brass">
              {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
