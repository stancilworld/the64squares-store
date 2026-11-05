import type { Metadata } from "next"
import { Suspense } from "react"
import { PuzzleTrainer } from "@/components/play/puzzles/trainer"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Puzzle of the day", description: "Today's chess puzzle on The 64 Squares." }

async function Daily() {
  return <PuzzleTrainer mode={{ kind: "daily" }} initialPass={await getPlayPass()} />
}

export default function DailyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Daily />
    </Suspense>
  )
}
