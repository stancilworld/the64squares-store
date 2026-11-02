import type { Metadata } from "next"
import { Suspense } from "react"
import { Leaderboard } from "@/components/play/leaderboard"
import { PanelHeader } from "@/components/play-shell/nav"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Leaderboard", description: "The top-rated chess players on The 64 Squares." }

async function Board() {
  const pass = await getPlayPass()
  return <Leaderboard meId={pass?.me.id ?? null} />
}

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-[860px]">
      <PanelHeader title="Leaderboard" />
      <p className="g-muted mt-2 text-[14px]">Ratings from rated online games and arenas, by speed.</p>
      <div className="mt-5">
        <Suspense fallback={<Loading />}>
          <Board />
        </Suspense>
      </div>
    </div>
  )
}
