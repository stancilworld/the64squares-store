import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ReviewLoader } from "@/components/play/analysis/review-loader"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Game review", robots: { index: false } }

async function Review({ params }: PageProps<"/play/analysis/[id]">) {
  const { id } = await params
  if (!/^(local|[A-Za-z0-9]{6,20})$/.test(id)) notFound()
  const pass = await getPlayPass()
  return <ReviewLoader id={id} meId={pass?.me.id ?? null} />
}

export default function ReviewPage(props: PageProps<"/play/analysis/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Review {...props} />
    </Suspense>
  )
}
