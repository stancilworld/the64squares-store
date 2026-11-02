import type { Metadata } from "next"
import { GameView } from "@/components/play/game-view"
import { getPlayPass } from "@/lib/play"
import { PlayShell } from "../shell"

export const metadata: Metadata = { title: "Game", robots: { index: false } }

async function Game({ params }: PageProps<"/play/[id]">) {
  const { id } = await params
  const pass = await getPlayPass()
  return <GameView id={id} token={pass?.token ?? null} meId={pass?.me.id ?? null} />
}

export default function GamePage(props: PageProps<"/play/[id]">) {
  return (
    <PlayShell fallback="Loading the game…">
      <Game {...props} />
    </PlayShell>
  )
}
