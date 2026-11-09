import Link from "next/link"
import type { ContentBlock } from "@/lib/types"
import { ArrowRight } from "./icons"
import { FillMedia } from "./media"

// Splits a heading after each ", " so "Every move, every board" sits on two lines.
export function headingLines(title: string | null) {
  return (title ?? "").split(/(?<=,)\s+/)
}

// Shown until a banner picture is uploaded in the admin (Website → Homepage).
const DEFAULT_IMAGE = "/images/home-hero.jpg"

// The homepage banner: the words on black beside a full-height photo, with an amber
// square (a highlighted square on the board) that leads to the Play area.
export function Hero({ block, showPlay = true }: { block: ContentBlock; showPlay?: boolean }) {
  return (
    <section aria-label="Welcome" className="grid bg-ink text-white lg:min-h-[620px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-soft sm:aspect-[16/9] lg:order-2 lg:aspect-auto">
        <FillMedia src={block.image_url || DEFAULT_IMAGE} sizes="(min-width: 1024px) 50vw, 100vw" priority />
        {showPlay && (
          <Link
            href="/play"
            className="group absolute bottom-0 left-0 flex aspect-square w-[148px] flex-col justify-between bg-amber p-4 text-black transition-colors hover:bg-white sm:w-[176px] sm:p-5 lg:w-[200px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pieces/classic/bN.svg" alt="" className="h-[44px] w-[44px] sm:h-[56px] sm:w-[56px]" />
            <span>
              <span className="block text-[13px] font-medium leading-tight sm:text-[14px]">Puzzles, bots and live games</span>
              <span className="mt-1 flex items-center gap-2 text-[17px] font-extrabold leading-tight tracking-tight sm:text-[20px]">
                Play chess free
                <ArrowRight className="h-[9px] w-[26px] transition-transform group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        )}
      </div>

      <div className="board-wash flex flex-col justify-center px-6 py-12 sm:px-10 lg:order-1 lg:px-16 lg:py-20 xl:px-24">
        <h1 className="font-display h-hero max-w-[640px] text-balance">{block.title}</h1>
        {block.body && <p className="mt-6 max-w-[460px] text-[17px] leading-[1.6] text-white/75">{block.body}</p>}
        {block.link_url && (
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={block.link_url} className="btn btn-amber">
              {block.link_label || "Shop now"}
            </Link>
            <Link href="/tournaments" className="btn btn-ghost-light">
              See tournaments
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
