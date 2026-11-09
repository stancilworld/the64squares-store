import type { ContentBlock } from "@/lib/types"
import { NewsletterForm } from "./newsletter-form"

export function NewsletterSection({
  block,
  className = "",
  bodyClassName = "max-w-[520px]",
}: {
  block: ContentBlock
  className?: string
  bodyClassName?: string
}) {
  return (
    <section id="newsletter" className={`mx-auto max-w-[1440px] scroll-mt-24 px-6 lg:px-10 ${className}`}>
      <h2 className="font-display h-section sq-mark">{block.title}</h2>
      {block.body && <p className={`mt-3 text-[16px] leading-[1.6] text-muted ${bodyClassName}`}>{block.body}</p>}
      <NewsletterForm label={block.link_label || "Subscribe"} />
    </section>
  )
}
