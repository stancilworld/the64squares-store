import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FillMedia } from "@/components/media"
import { PanelHeader } from "@/components/play-shell/nav"
import { getNews, getNewsArticle } from "@/lib/data"
import { newsDate } from "@/lib/news-date"
import { absoluteUrl, jsonLd, seoMetadata } from "@/lib/seo"
import { Loading } from "../../loading-text"

export async function generateMetadata({ params }: PageProps<"/play/news/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const a = await getNewsArticle(handle)
  return a
    ? seoMetadata({ path: `/play/news/${a.handle}`, title: a.title, description: a.excerpt, image: a.cover_url, type: "article", publishedAt: a.published_at })
    : { title: "News" }
}

async function Article({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const a = await getNewsArticle(handle)
  if (!a) notFound()
  const { articles } = await getNews(4)
  const more = articles.filter((m) => m.handle !== a.handle).slice(0, 3)

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: a.title,
          description: a.excerpt ?? undefined,
          image: a.cover_url ? [absoluteUrl(a.cover_url)] : undefined,
          datePublished: a.published_at ?? undefined,
          author: { "@type": "Organization", name: a.author },
          publisher: { "@type": "Organization", name: "The 64 Squares", logo: { "@type": "ImageObject", url: absoluteUrl("/brand/logo-mark.png") } },
          mainEntityOfPage: absoluteUrl(`/play/news/${a.handle}`),
        })}
      />
      <header className="mx-auto mt-6 max-w-[760px]">
        <Link href={`/play/news?topic=${encodeURIComponent(a.topic)}`} className="text-[13px] font-semibold text-[var(--g-accent)] hover:underline">
          {a.topic}
        </Link>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.08] tracking-tight sm:text-[42px]">{a.title}</h1>
        {a.excerpt && <p className="g-muted mt-4 text-[18px] leading-[1.5]">{a.excerpt}</p>}
        <p className="g-muted mt-5 flex flex-wrap gap-x-3 border-t border-[var(--g-line)] pt-3 text-[13px]">
          <span>By {a.author}</span>
          {a.published_at && <time dateTime={a.published_at}>{newsDate(a.published_at)}</time>}
        </p>
      </header>
      {a.cover_url && (
        <div className="relative mx-auto mt-6 aspect-[16/9] max-w-[960px] overflow-hidden rounded-lg bg-[var(--g-panel-2)]">
          <FillMedia src={a.cover_url} sizes="(min-width: 1024px) 960px, 100vw" priority />
        </div>
      )}
      {/* Cleaned by the server when the article was saved (only the editor's own formatting). */}
      <div className="news-body mx-auto mt-8 max-w-[720px]" dangerouslySetInnerHTML={{ __html: a.body_html }} />

      {more.length > 0 && (
        <aside className="mx-auto mt-14 max-w-[960px] border-t border-[var(--g-line)] pt-6">
          <h2 className="text-[18px] font-bold">More news</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {more.map((m) => (
              <li key={m.handle}>
                <Link href={`/play/news/${m.handle}`} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[var(--g-panel-2)]">
                    {m.cover_url && <FillMedia src={m.cover_url} sizes="(min-width: 640px) 30vw, 100vw" />}
                  </div>
                  <p className="mt-2 text-[12px] font-semibold text-[var(--g-accent)]">{m.topic}</p>
                  <h3 className="mt-1 text-[15px] font-bold leading-[1.3] group-hover:underline">{m.title}</h3>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  )
}

export default function NewsArticlePage(props: PageProps<"/play/news/[handle]">) {
  return (
    <div className="mx-auto max-w-[1100px] pb-10">
      <PanelHeader title="News" back="/play/news" backLabel="All news" />
      <Suspense fallback={<Loading />}>
        <Article params={props.params} />
      </Suspense>
    </div>
  )
}
