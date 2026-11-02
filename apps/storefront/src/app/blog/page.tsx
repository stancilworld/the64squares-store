import type { Metadata } from "next"
import { FillMedia } from "@/components/media"
import Link from "next/link"
import { Suspense } from "react"
import { ChevronDown } from "@/components/icons"
import { PostDate } from "@/components/post-date"
import { getPosts } from "@/lib/data"

export const metadata: Metadata = { title: "Letters from Stancil" }

const PAGE = 3

async function PostList({ limit }: { limit: number }) {
  const { posts, count } = await getPosts(limit)
  if (!posts.length) {
    return <p className="mt-16 text-center text-[20px]">Our first letter is on its way.</p>
  }
  return (
    <>
      <ul className="mt-[40px] lg:mt-[134px]">
        {posts.map((p) => (
          <li key={p.handle} className="border-b border-black pb-[40px] pt-[40px] first:pt-0 lg:ml-[38px] lg:mr-[13px] lg:pb-[85px] lg:pt-[136px] lg:first:pt-0">
            <Link href={`/blog/${p.handle}`} className="group flex gap-5 sm:gap-[48px] lg:-mx-[20px]">
              <div className="relative aspect-square w-[110px] shrink-0 overflow-hidden rounded-[16px] bg-placeholder sm:w-[200px] lg:w-[300px] lg:rounded-[34px]">
                {(p.thumbnail_url || p.cover_url) && (
                  <FillMedia src={(p.thumbnail_url || p.cover_url)!} sizes="(min-width: 1024px) 300px, 200px" />
                )}
              </div>
              <div className="min-w-0 pt-1 lg:pt-[2px]">
                <h2 className="text-[20px] leading-[1.15] group-hover:underline sm:text-[28px] lg:max-w-[600px] lg:text-[40px] lg:leading-[44px]">
                  {p.title}
                </h2>
                <p className="mt-2 text-[16px] italic sm:text-[22px] lg:mt-[22px] lg:text-[32px]">by {p.author}</p>
                <PostDate iso={p.published_at} className="mt-1 block text-[14px] sm:text-[18px] lg:mt-[22px] lg:text-[24px]" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {posts.length < count && (
        <div className="mt-[64px] flex justify-center lg:mt-[208px]">
          <Link
            href={`/blog?show=${limit + PAGE}`}
            scroll={false}
            className="flex items-center gap-[14px] text-[28px] lg:text-[32px]"
          >
            <span className="underline decoration-[2px] underline-offset-[8px]">See More</span>
            <ChevronDown className="mt-2 h-[22px] w-[26px]" />
          </Link>
        </div>
      )}
    </>
  )
}

async function PostListFromParams({ searchParams }: { searchParams: PageProps<"/blog">["searchParams"] }) {
  const { show } = await searchParams
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 60)
  return <PostList limit={limit} />
}

export default function BlogPage({ searchParams }: PageProps<"/blog">) {
  return (
    <section className="mx-auto mb-[96px] max-w-[1440px] px-6 pt-[48px] lg:mb-[150px] lg:px-[199px] lg:pt-[85px]">
      <h1 className="font-display text-[64px] lg:text-[128px]">Letters from Stancil</h1>
      <Suspense fallback={<PostList limit={PAGE} />}>
        <PostListFromParams searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
