import type { Metadata } from "next"
import { Suspense } from "react"
import { ArenaView } from "@/components/play/arena-view"
import { getPlayPass } from "@/lib/play"

export const metadata: Metadata = { title: "Arena", robots: { index: false } }

async function Arena({ params }: PageProps<"/tournaments/[handle]/arena">) {
  const { handle } = await params
  const pass = await getPlayPass()
  return <ArenaView idOrHandle={handle} token={pass?.token ?? null} meId={pass?.me.id ?? null} />
}

export default function ArenaPage(props: PageProps<"/tournaments/[handle]/arena">) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pb-24 lg:pt-10">
      <Suspense fallback={<p className="py-16 text-center text-muted">Opening the arena…</p>}>
        <Arena {...props} />
      </Suspense>
    </section>
  )
}
