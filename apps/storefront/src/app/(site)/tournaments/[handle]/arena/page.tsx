import { redirect } from "next/navigation"
import { Suspense } from "react"

// The arena now lives in the Play area.
async function Go({ params }: PageProps<"/tournaments/[handle]/arena">) {
  const { handle } = await params
  redirect(`/play/arena/${encodeURIComponent(handle)}`)
  return null
}

export default function OldArenaPage(props: PageProps<"/tournaments/[handle]/arena">) {
  return (
    <Suspense fallback={null}>
      <Go {...props} />
    </Suspense>
  )
}
