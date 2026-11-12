import { redirect } from "next/navigation"
import { Suspense } from "react"

// Arenas now have the full tournament page.
async function Go({ params }: { params: Promise<{ handle: string }> }) {
  redirect(`/play/tournaments/${(await params).handle}`)
  return null
}

export default function ArenaPage(props: PageProps<"/play/arena/[handle]">) {
  return (
    <Suspense fallback={null}>
      <Go params={props.params} />
    </Suspense>
  )
}
