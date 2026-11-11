import Link from "next/link"
import type { ContentBlock } from "@/lib/types"
import { ArrowRight } from "./icons"
import { HeroFrame } from "./hero-frame"
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
    // The picture keeps one shape (5:4) everywhere so nothing in it is cut off, and the hero
    // fits the screen below the header: on phones the picture, heading and both buttons are
    // in view together; on short laptops the heading and spacing shrink with the height.
    <HeroFrame className="hero grid items-stretch bg-ink text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="hero-media relative mx-auto aspect-[5/4] w-full self-start overflow-hidden bg-ink-soft lg:order-2 lg:self-center lg:justify-self-center">
        <FillMedia src={block.image_url || DEFAULT_IMAGE} sizes="(min-width: 1024px) 50vw, 100vw" priority />
        {showPlay && (
          <Link href="/play" className="hero-play group absolute bottom-0 left-0 flex aspect-square flex-col justify-between bg-amber text-black transition-colors hover:bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pieces/classic/bN.svg" alt="" className="hero-play-icon" />
            <span>
              <span className="hero-play-note block font-medium leading-tight">Puzzles, bots and live games</span>
              <span className="hero-play-cta mt-1 flex items-center justify-between gap-2 font-extrabold leading-tight tracking-tight">
                Play chess free
                <ArrowRight className="h-[9px] w-[22px] shrink-0 transition-transform group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        )}
      </div>

      <div className="hero-copy board-wash flex flex-col justify-center lg:order-1">
        <h1 className="hero-title font-display max-w-[640px] text-balance">{block.title}</h1>
        {block.body && <p className="hero-body max-w-[460px] text-white/75">{block.body}</p>}
        {block.link_url && (
          <div className="hero-actions flex flex-wrap gap-3">
            <Link href={block.link_url} className="btn btn-amber">
              {block.link_label || "Shop now"}
            </Link>
            <Link href="/tournaments" className="btn btn-ghost-light">
              See tournaments
            </Link>
          </div>
        )}
      </div>
    </HeroFrame>
  )
}
