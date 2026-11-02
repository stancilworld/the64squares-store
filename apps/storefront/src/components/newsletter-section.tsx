import type { ContentBlock } from "@/lib/types"
import { NewsletterForm } from "./newsletter-form"

export function NewsletterSection({
  block,
  className = "",
  bodyClassName = "max-w-[1184px]",
}: {
  block: ContentBlock
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`mx-auto max-w-[1440px] px-6 ${className}`}>
      <h2 className="font-display text-[48px] leading-[36px] lg:text-[96px] lg:leading-[1]">{block.title}</h2>
      {block.body && (
        <p className={`mt-[20px] text-[16px] leading-[25px] lg:mt-[20px] ${bodyClassName}`}>{block.body}</p>
      )}
      <NewsletterForm label={block.link_label || "Subscribe for our newsletter"} />
    </section>
  )
}
