import type { Metadata } from "next"
import { Suspense } from "react"
import { GameView } from "@/components/play/game-view"
import { getPlayPass } from "@/lib/play"

export const metadata: Metadata = { title: "Game", robots: { index: false } }

async function Game({ params }: PageProps<"/play/[id]">) {
  const { id } = await params
  const pass = await getPlayPass()
  return <GameView id={id} token={pass?.token ?? null} meId={pass?.me.id ?? null} />
}

export default function GamePage(props: PageProps<"/play/[id]">) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pb-24 lg:pt-10">
      <Suspense fallback={<p className="py-16 text-center text-muted">Loading the game…</p>}>
        <Game {...props} />
      </Suspense>
    </section>
  )
}
