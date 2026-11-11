import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { FillMedia } from "@/components/media"
import { PanelHeader } from "@/components/play-shell/nav"
import { getNews } from "@/lib/data"
import { newsDate } from "@/lib/news-date"
import type { NewsSummary, NewsTopic } from "@/lib/types"
import { Loading } from "../loading-text"
import { seoMetadata } from "@/lib/seo"

export const generateMetadata = (): Promise<Metadata> =>
  seoMetadata({ path: "/play/news", title: "News", description: "Tournament results, club news and announcements from The 64 Squares." })

const PAGE = 13

const href = (topic: string | null, show?: number) => {
  const q = new URLSearchParams()
  if (topic) q.set("topic", topic)
  if (show) q.set("show", String(show))
  const s = q.toString()
  return s ? `/play/news?${s}` : "/play/news"
}

function Topics({ topics, current, total }: { topics: NewsTopic[]; current: string | null; total: number }) {
  if (topics.length < 2 && !current) return null
  const items = [{ name: null as string | null, label: "All", count: total }, ...topics.map((t) => ({ name: t.name, label: t.name, count: t.count }))]
  return (
    <nav aria-label="News topics" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2">
        {items.map((t) => {
          const on = t.name === current
          return (
            <li key={t.label} className="shrink-0">
              <Link
                href={href(t.name)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition ${
                  on ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel)] text-[var(--g-muted)] hover:text-white"
                }`}
              >
                {t.label}
                <span className={`text-[12px] tabular-nums ${on ? "text-black/60" : ""}`}>{t.count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const Meta = ({ a }: { a: NewsSummary }) => (
  <p className="flex flex-wrap items-center gap-x-2 text-[12px] font-semibold">
    <span className="text-[var(--g-accent)]">{a.topic}</span>
    {a.published_at && (
      <time dateTime={a.published_at} className="g-muted font-medium">
        {newsDate(a.published_at)}
      </time>
    )}
  </p>
)

const Cover = ({ a, sizes, priority = false }: { a: NewsSummary; sizes: string; priority?: boolean }) => (
  <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[var(--g-panel-2)]">
    {a.cover_url ? (
      <FillMedia src={a.cover_url} sizes={sizes} priority={priority} />
    ) : (
      // No cover picture: a piece on the panel colour instead of an empty box.
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/play-art/wN.webp" alt="" className="absolute inset-0 m-auto h-[70%] w-auto opacity-80" />
    )}
  </div>
)

async function List({ limit, topic }: { limit: number; topic: string | null }) {
  const [{ articles, count }, all] = await Promise.all([getNews(limit, topic), getNews(1)])
  const total = all.topics.reduce((n, t) => n + t.count, 0)
  const top = topic ? articles[0] : (articles.find((a) => a.featured) ?? articles[0])
  const rest = articles.filter((a) => a !== top)

  return (
    <>
      <Topics topics={all.topics} current={topic} total={total} />
      {!top ? (
        <div className="g-panel mt-5 px-6 py-14 text-center">
          <p className="text-[18px] font-bold">{topic ? `No news about ${topic} yet.` : "No news yet."}</p>
          <p className="g-muted mt-1 text-[14px]">Tournament results and announcements will show here.</p>
        </div>
      ) : (
        <>
          <Link href={`/play/news/${top.handle}`} className="g-panel group mt-5 grid gap-4 p-3 sm:p-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-6">
            <Cover a={top} sizes="(min-width: 1024px) 520px, 100vw" priority />
            <div className="flex flex-col justify-center px-1 pb-2 md:px-0 md:pb-0">
              <Meta a={top} />
              <h2 className="mt-2 text-[24px] font-extrabold leading-[1.1] tracking-tight group-hover:underline sm:text-[30px]">{top.title}</h2>
              {top.excerpt && <p className="g-muted mt-3 line-clamp-3 text-[15px] leading-[1.55]">{top.excerpt}</p>}
              <p className="g-muted mt-4 text-[13px]">By {top.author}</p>
            </div>
          </Link>
          {rest.length > 0 && (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((a) => (
                <li key={a.handle}>
                  <Link href={`/play/news/${a.handle}`} className="g-panel group flex h-full flex-col p-3">
                    <Cover a={a} sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw" />
                    <div className="px-1 pb-1 pt-3">
                      <Meta a={a} />
                      <h3 className="mt-1.5 text-[17px] font-bold leading-[1.25] group-hover:underline">{a.title}</h3>
                      {a.excerpt && <p className="g-muted mt-1.5 line-clamp-2 text-[14px] leading-[1.5]">{a.excerpt}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {articles.length < count && (
            <div className="mt-6 flex justify-center">
              <Link href={href(topic, limit + 12)} scroll={false} className="g-btn g-btn-ghost">
                Show more news
              </Link>
            </div>
          )}
        </>
      )}
    </>
  )
}

async function FromParams({ searchParams }: { searchParams: PageProps<"/play/news">["searchParams"] }) {
  const { show, topic } = await searchParams
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 60)
  return <List limit={limit} topic={typeof topic === "string" && topic ? topic : null} />
}

export default function NewsPage({ searchParams }: PageProps<"/play/news">) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PanelHeader title="News" />
      <Suspense fallback={<Loading />}>
        <FromParams searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
