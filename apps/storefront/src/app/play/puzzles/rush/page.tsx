import type { Metadata } from "next"
import { Suspense } from "react"
import { PuzzleRush } from "@/components/play/puzzles/rush"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Puzzle Rush", description: "Solve as many chess puzzles as you can in 3 minutes." }

async function Rush() {
  return <PuzzleRush initialPass={await getPlayPass()} />
}

export default function RushPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Rush />
    </Suspense>
  )
}
