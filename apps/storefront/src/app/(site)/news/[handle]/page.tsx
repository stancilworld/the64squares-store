import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftLong } from "@/components/icons"
import { FillMedia } from "@/components/media"
import { getNews, getNewsArticle } from "@/lib/data"
import { newsDate } from "../date"

export async function generateMetadata({ params }: PageProps<"/news/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const a = await getNewsArticle(handle)
  return a
    ? { title: a.title, description: a.excerpt ?? undefined, openGraph: { title: a.title, description: a.excerpt ?? undefined, images: a.cover_url ? [a.cover_url] : undefined, type: "article" } }
    : { title: "News" }
}

async function Article({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const a = await getNewsArticle(handle)
  if (!a) notFound()
  const { articles } = await getNews(4)
  const more = articles.filter((m) => m.handle !== a.handle).slice(0, 3)

  return (
    <article className="mb-[96px] lg:mb-[120px]">
      <header className="mx-auto max-w-[800px] px-6 pt-6 lg:pt-[48px]">
        <Link href="/news" className="inline-flex items-center gap-[6px] text-[15px] hover:underline">
          <ArrowLeftLong className="h-[10px] w-[32px]" />
          All news
        </Link>
        <Link href={`/news?topic=${encodeURIComponent(a.topic)}`} className="mt-8 block w-fit text-[14px] font-semibold text-amber-deep hover:underline">
          {a.topic}
        </Link>
        <h1 className="mt-2 font-display text-[32px] font-extrabold leading-[1.04] tracking-[-0.035em] lg:text-[52px]">{a.title}</h1>
        {a.excerpt && <p className="mt-5 text-[19px] leading-[1.5] text-ink/80 lg:text-[22px]">{a.excerpt}</p>}
        <p className="mt-6 flex flex-wrap gap-x-3 border-t border-rule pt-4 text-[14px] text-muted">
          <span>By {a.author}</span>
          {a.published_at && <time dateTime={a.published_at}>{newsDate(a.published_at)}</time>}
        </p>
      </header>
      {a.cover_url && (
        <div className="mx-auto mt-8 max-w-[1100px] lg:mt-10 lg:px-6">
          <div className="relative aspect-[16/9] overflow-hidden bg-placeholder lg:rounded-md">
            <FillMedia src={a.cover_url} sizes="(min-width: 1100px) 1100px, 100vw" priority />
          </div>
        </div>
      )}
      {/* Cleaned by the server when the article was saved (only the editor's own formatting). */}
      <div className="news-body mx-auto mt-10 max-w-[720px] px-6 lg:mt-14" dangerouslySetInnerHTML={{ __html: a.body_html }} />

      {more.length > 0 && (
        <aside className="mx-auto mt-20 max-w-[1100px] border-t border-ink px-6 pt-10 lg:mt-28">
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">More news</h2>
          <ul className="mt-6 grid gap-8 sm:grid-cols-3">
            {more.map((m) => (
              <li key={m.handle}>
                <Link href={`/news/${m.handle}`} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-placeholder">
                    {m.cover_url && <FillMedia src={m.cover_url} sizes="(min-width: 640px) 33vw, 100vw" />}
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-amber-deep">{m.topic}</p>
                  <h3 className="mt-1 text-[17px] font-bold leading-[1.25] group-hover:underline">{m.title}</h3>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  )
}

export default function NewsArticlePage(props: PageProps<"/news/[handle]">) {
  return (
    <Suspense fallback={<div className="h-[1600px]" />}>
      <Article params={props.params} />
    </Suspense>
  )
}
