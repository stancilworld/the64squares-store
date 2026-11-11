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
    // The picture keeps one shape (5:4) on every screen, from phones to wide monitors, so it
    // is framed the same everywhere and nothing important gets cut off; the text column
    // beside it centres itself.
    <section aria-label="Welcome" className="grid items-stretch bg-ink text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative aspect-[5/4] self-start overflow-hidden bg-ink-soft lg:order-2 lg:w-[min(100%,calc((100svh-96px)*1.25))] lg:self-center lg:justify-self-center">
        <FillMedia src={block.image_url || DEFAULT_IMAGE} sizes="(min-width: 1024px) 50vw, 100vw" priority />
        {showPlay && (
          <Link
            href="/play"
            className="group absolute bottom-0 left-0 flex items-center gap-3 bg-amber px-4 py-3 text-black transition-colors hover:bg-white sm:aspect-square sm:w-[176px] sm:flex-col sm:items-stretch sm:justify-between sm:gap-0 sm:p-5 lg:w-[200px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pieces/classic/bN.svg" alt="" className="h-[32px] w-[32px] sm:h-[56px] sm:w-[56px]" />
            <span>
              <span className="hidden text-[14px] font-medium leading-tight sm:block">Puzzles, bots and live games</span>
              <span className="flex items-center gap-2 text-[17px] sm:mt-1 font-extrabold leading-tight tracking-tight sm:text-[20px]">
                Play chess free
                <ArrowRight className="h-[9px] w-[26px] transition-transform group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        )}
      </div>

      <div className="board-wash flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:order-1 lg:px-12 lg:py-14 xl:px-20">
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
