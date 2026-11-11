import type { Metadata } from "next"
import { Suspense } from "react"
import { GameView } from "@/components/play/game-view"
import { getSiteFeatures } from "@/lib/data"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Game", robots: { index: false } }

async function Game({ params }: PageProps<"/play/[id]">) {
  const { id } = await params
  const [pass, features] = await Promise.all([getPlayPass(), getSiteFeatures()])
  return <GameView id={id} initialPass={pass} share={features.share_buttons.enabled} />
}

export default function GamePage(props: PageProps<"/play/[id]">) {
  return (
    <Suspense fallback={<Loading text="Loading the game…" />}>
      <Game {...props} />
    </Suspense>
  )
}
