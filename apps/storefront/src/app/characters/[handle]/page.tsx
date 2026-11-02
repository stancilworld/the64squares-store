import { redirect } from "next/navigation"
import { Suspense } from "react"

// A character's page is the shop, filtered to that character ("Bella the Builder").
async function Go({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  redirect(`/shop?character=${encodeURIComponent(handle)}`)
  return null
}

export default function CharacterPage(props: PageProps<"/characters/[handle]">) {
  return (
    <Suspense>
      <Go params={props.params} />
    </Suspense>
  )
}
