import type { Metadata } from "next"
import { Suspense } from "react"
import { PlayerProfile } from "@/components/play/player-profile"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Player" }

async function Player({ params }: PageProps<"/play/player/[username]">) {
  const { username } = await params
  return <PlayerProfile username={username} />
}

export default function PlayerPage(props: PageProps<"/play/player/[username]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Player {...props} />
    </Suspense>
  )
}
