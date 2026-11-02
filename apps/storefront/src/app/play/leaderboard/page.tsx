import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Leaderboard } from "@/components/play/leaderboard"
import { getPlayPass } from "@/lib/play"

export const metadata: Metadata = { title: "Leaderboard", description: "The top-rated chess players on The 64 Squares." }

async function Board() {
  const pass = await getPlayPass()
  return <Leaderboard meId={pass?.me.id ?? null} />
}

export default function LeaderboardPage() {
  return (
    <section className="mx-auto max-w-[860px] px-4 pb-16 pt-8 sm:px-6 lg:pb-24 lg:pt-12">
      <p className="text-[14px]">
        <Link href="/play" className="text-muted underline-offset-4 hover:underline">
          Play
        </Link>
      </p>
      <h1 className="font-display h-page mt-1">Leaderboard</h1>
      <p className="mt-2 text-[15px] text-muted">Ratings from rated online games and arenas, by speed.</p>
      <div className="mt-6">
        <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
          <Board />
        </Suspense>
      </div>
    </section>
  )
}
