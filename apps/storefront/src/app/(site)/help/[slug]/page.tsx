import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { SitePageView } from "@/components/site-page"
import { getSitePage } from "@/lib/data"
import { seoMetadata } from "@/lib/seo"

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const page = await getSitePage(slug)
  return page ? seoMetadata({ path: `/help/${page.handle}`, title: page.title, description: page.body.replace(/[#*_>\[\]()`-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 155) }) : { title: "Help" }
}

async function Help({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await getSitePage(slug)
  if (!page) {
    notFound()
  }
  return <SitePageView page={page} />
}

export default function HelpPage(props: PageProps<"/help/[slug]">) {
  return (
    <Suspense fallback={<div className="h-[900px]" />}>
      <Help params={props.params} />
    </Suspense>
  )
}
