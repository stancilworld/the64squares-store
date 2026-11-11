import Link from "next/link"
import { SITE_URL } from "@/lib/site"

// "Shop › Category › Product" at the top of a page, and the same trail for Google.
export type Crumb = { name: string; path: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={c.path} className="flex min-w-0 items-center gap-x-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              {last ? (
                <span aria-current="page" className="max-w-[40ch] truncate text-ink/70">
                  {c.name}
                </span>
              ) : (
                <Link href={c.path} className="hover:underline">
                  {c.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export const breadcrumbJsonLd = (items: Crumb[]) => ({
  __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  }).replace(/</g, "\\u003c"),
})
