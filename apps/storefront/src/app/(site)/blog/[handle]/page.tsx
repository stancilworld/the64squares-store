import type { Metadata } from "next"
import { FillMedia } from "@/components/media"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftLong } from "@/components/icons"
import { PostDate } from "@/components/post-date"
import { RichText } from "@/components/rich-text"
import { ShareButtons } from "@/components/share-buttons"
import { getPost, getSiteFeatures } from "@/lib/data"
import { absoluteUrl, jsonLd, seoMetadata } from "@/lib/seo"

export async function generateMetadata({ params }: PageProps<"/blog/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const post = await getPost(handle)
  return post
    ? seoMetadata({ path: `/blog/${post.handle}`, title: post.title, description: post.excerpt, image: post.cover_url ?? post.thumbnail_url, type: "article", publishedAt: post.published_at })
    : { title: "The 64 Squares Journal" }
}

async function Post({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [post, features] = await Promise.all([getPost(handle), getSiteFeatures()])
  if (!post) {
    notFound()
  }

  return (
    <article className="mb-[96px] lg:mb-[100px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt ?? undefined,
          image: post.cover_url ? [absoluteUrl(post.cover_url)] : undefined,
          datePublished: post.published_at ?? undefined,
          author: { "@type": "Person", name: post.author },
          publisher: { "@type": "Organization", name: "The 64 Squares", logo: { "@type": "ImageObject", url: absoluteUrl("/brand/logo-mark.png") } },
          mainEntityOfPage: absoluteUrl(`/blog/${post.handle}`),
        })}
      />
      <div className="mx-auto max-w-[1440px] px-6 pt-6 lg:px-[80px] lg:pt-[51px]">
        <Link href="/blog" className="inline-flex items-center gap-[3px] text-[16px] hover:underline">
          <ArrowLeftLong className="h-[10px] w-[40px]" />
          Back to Blog
        </Link>
        <h1 className="mx-auto mt-6 max-w-[900px] text-center font-display h-page lg:mt-[14px]">
          {post.title}
        </h1>
      </div>
      <div className="relative mt-[40px] aspect-[1440/573] w-full bg-placeholder lg:mt-[126px]">
        {post.cover_url && (
          <FillMedia src={post.cover_url} sizes="100vw" priority />
        )}
      </div>
      <div className="mx-auto max-w-[1440px] px-6 lg:pl-[264px] lg:pr-[248px]">
        <RichText text={post.body} className="mt-[48px] text-[17px] leading-[28px] lg:mt-[114px] lg:text-[18px]" />
        <p className="mt-[40px] text-[24px] italic lg:mt-[38px] lg:text-[32px]">by {post.author}</p>
        <PostDate iso={post.published_at} className="mt-1 block text-[18px] lg:text-[20px]" />
        {features.share_buttons.enabled && <ShareButtons path={`/blog/${post.handle}`} title={post.title} className="mt-8" />}
      </div>
    </article>
  )
}

export default function BlogPostPage(props: PageProps<"/blog/[handle]">) {
  return (
    <Suspense fallback={<div className="h-[1600px]" />}>
      <Post params={props.params} />
    </Suspense>
  )
}
