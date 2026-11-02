import type { Metadata } from "next"
import { Suspense } from "react"
import { ArenaView } from "@/components/play/arena-view"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Arena", robots: { index: false } }

async function Arena({ params }: PageProps<"/play/arena/[handle]">) {
  const { handle } = await params
  const pass = await getPlayPass()
  return <ArenaView idOrHandle={handle} token={pass?.token ?? null} meId={pass?.me.id ?? null} myName={pass?.me.name ?? null} />
}

export default function ArenaPage(props: PageProps<"/play/arena/[handle]">) {
  return (
    <Suspense fallback={<Loading text="Opening the arena…" />}>
      <Arena {...props} />
    </Suspense>
  )
}
