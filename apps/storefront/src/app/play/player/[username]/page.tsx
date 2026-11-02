import type { Metadata } from "next"
import { Suspense } from "react"
import { PlayerProfile } from "@/components/play/player-profile"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Player" }

async function Player({ params }: PageProps<"/play/player/[username]">) {
  const { username } = await params
  const pass = await getPlayPass()
  return <PlayerProfile username={username} meId={pass?.me.id ?? null} />
}

export default function PlayerPage(props: PageProps<"/play/player/[username]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Player {...props} />
    </Suspense>
  )
}
