import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { FillMedia } from "@/components/media"
import { getNews } from "@/lib/data"
import type { NewsSummary, NewsTopic } from "@/lib/types"
import { newsDate } from "./date"

export const metadata: Metadata = {
  title: "News",
  description: "Tournament results, club news and announcements from The 64 Squares.",
}

const PAGE = 13

const href = (topic: string | null, show?: number) => {
  const q = new URLSearchParams()
  if (topic) q.set("topic", topic)
  if (show) q.set("show", String(show))
  const s = q.toString()
  return s ? `/news?${s}` : "/news"
}

function Topics({ topics, current, total }: { topics: NewsTopic[]; current: string | null; total: number }) {
  if (topics.length < 2 && !current) return null
  const items = [{ name: null as string | null, label: "All news", count: total }, ...topics.map((t) => ({ name: t.name, label: t.name, count: t.count }))]
  return (
    <nav aria-label="News topics" className="-mx-6 overflow-x-auto px-6 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {items.map((t) => {
          const on = t.name === current
          return (
            <li key={t.label} className="shrink-0">
              <Link
                href={href(t.name)}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-full border px-4 py-2 text-[15px] transition-colors lg:rounded-md lg:border-0 lg:px-3 ${
                  on ? "border-ink bg-ink text-white" : "border-rule hover:bg-chalk"
                }`}
              >
                <span className={on ? "font-semibold" : ""}>{t.label}</span>
                <span className={`text-[13px] tabular-nums ${on ? "text-white/70" : "text-muted"}`}>{t.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Meta({ a, className = "" }: { a: NewsSummary; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-[13px] text-muted ${className}`}>
      <span className="font-semibold text-amber-deep">{a.topic}</span>
      {a.published_at && <time dateTime={a.published_at}>{newsDate(a.published_at)}</time>}
    </p>
  )
}

function TopStory({ a }: { a: NewsSummary }) {
  return (
    <Link href={`/news/${a.handle}`} className="group grid gap-5 border-b border-ink pb-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10 lg:pb-14">
      <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-placeholder">
        {a.cover_url && <FillMedia src={a.cover_url} sizes="(min-width: 1024px) 640px, 100vw" priority />}
      </div>
      <div className="flex flex-col justify-center">
        <Meta a={a} />
        <h2 className="mt-3 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] group-hover:underline lg:text-[40px]">{a.title}</h2>
        {a.excerpt && <p className="mt-4 line-clamp-4 text-[16px] leading-[1.6] text-ink/80 lg:text-[17px]">{a.excerpt}</p>}
        <p className="mt-5 text-[14px] text-muted">By {a.author}</p>
      </div>
    </Link>
  )
}

function Card({ a }: { a: NewsSummary }) {
  return (
    <Link href={`/news/${a.handle}`} className="group flex flex-col">
      <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-placeholder">
        {a.cover_url && <FillMedia src={a.cover_url} sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 100vw" />}
      </div>
      <Meta a={a} className="mt-3" />
      <h3 className="mt-1.5 text-[19px] font-bold leading-[1.2] tracking-[-0.015em] group-hover:underline">{a.title}</h3>
      {a.excerpt && <p className="mt-2 line-clamp-2 text-[15px] leading-[1.5] text-ink/75">{a.excerpt}</p>}
    </Link>
  )
}

async function NewsList({ limit, topic }: { limit: number; topic: string | null }) {
  const [{ articles, count }, all] = await Promise.all([getNews(limit, topic), getNews(1)])
  const total = all.topics.reduce((n, t) => n + t.count, 0)
  // The top story: the newest featured article (on "All news"), otherwise the newest one.
  const top = topic ? articles[0] : (articles.find((a) => a.featured) ?? articles[0])
  const rest = articles.filter((a) => a !== top)

  return (
    <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Topics topics={all.topics} current={topic} total={total} />
      </aside>
      <div className="min-w-0">
        {!top ? (
          <div className="rounded-md bg-chalk px-6 py-16 text-center">
            <p className="text-[20px] font-semibold">{topic ? `No news about ${topic} yet.` : "No news yet."}</p>
            <p className="mt-2 text-muted">{topic ? <Link href="/news" className="underline">See all news</Link> : "Check back soon for tournament results and announcements."}</p>
          </div>
        ) : (
          <>
            <TopStory a={top} />
            {rest.length > 0 && (
              <ul className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((a) => (
                  <li key={a.handle}>
                    <Card a={a} />
                  </li>
                ))}
              </ul>
            )}
            {articles.length < count && (
              <div className="mt-14 flex justify-center">
                <Link href={href(topic, limit + 12)} scroll={false} className="rounded-full border border-ink px-6 py-3 text-[15px] font-semibold hover:bg-ink hover:text-white">
                  Show more news
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

async function NewsFromParams({ searchParams }: { searchParams: PageProps<"/news">["searchParams"] }) {
  const { show, topic } = await searchParams
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 60)
  return <NewsList limit={limit} topic={typeof topic === "string" && topic ? topic : null} />
}

export default function NewsPage({ searchParams }: PageProps<"/news">) {
  return (
    <section className="mx-auto mb-[96px] max-w-[1440px] px-6 pt-[40px] lg:mb-[140px] lg:px-[80px] lg:pt-[64px]">
      <h1 className="font-display h-page">News</h1>
      <Suspense fallback={<NewsList limit={PAGE} topic={null} />}>
        <NewsFromParams searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
