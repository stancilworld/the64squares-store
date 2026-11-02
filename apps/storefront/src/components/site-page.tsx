import { RichText } from "@/components/rich-text"
import type { SitePage } from "@/lib/types"

// Help pages, edited in the admin under "Help pages".
export function SitePageView({ page }: { page: SitePage }) {
  return (
    <article className="mx-auto mb-[96px] max-w-[1440px] px-6 pt-[48px] lg:mb-[150px] lg:px-[264px] lg:pt-[63px]">
      <h1 className="font-display text-[56px] leading-[1] lg:text-[96px]">{page.title}</h1>
      <RichText text={page.body} className="mt-[32px] max-w-[912px] text-[17px] leading-[28px] lg:mt-[48px] lg:text-[18px]" />
    </article>
  )
}
