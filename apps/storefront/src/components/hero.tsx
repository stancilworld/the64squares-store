import Link from "next/link"
import type { ContentBlock } from "@/lib/types"
import { FillMedia } from "./media"

// Splits a heading after each ", " so "Every move, Every board" sits on two lines.
export function headingLines(title: string | null) {
  return (title ?? "").split(/(?<=,)\s+/)
}

// The homepage banner. Its picture, GIF or video fills the whole banner behind the text.
export function Hero({ block }: { block: ContentBlock }) {
  const lines = headingLines(block.title)
  return (
    <section aria-label="Welcome" className="relative overflow-hidden bg-placeholder">
      {block.image_url && <FillMedia src={block.image_url} sizes="100vw" priority />}
      <div className="relative mx-auto flex min-h-[460px] max-w-[1440px] flex-col justify-center px-6 py-12 md:h-[557px] md:min-h-0 md:px-[157px] md:py-0">
        <div className="md:pt-[82px]">
          <h1 className="font-display text-[72px] leading-[46px] text-ink md:text-[clamp(96px,10.4vw,150px)] md:leading-[clamp(60px,6.53vw,94px)]">
            {lines.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h1>
          {block.body && <p className="mt-[24px] text-[18px] md:mt-[10px] md:text-[20px]">{block.body}</p>}
          {block.link_url && (
            <Link
              href={block.link_url}
              className="mt-[16px] inline-flex h-[42px] min-w-[140px] items-center justify-center rounded-full bg-ink px-6 text-[16px] text-white hover:bg-black"
            >
              {block.link_label || "Shop Now"}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
