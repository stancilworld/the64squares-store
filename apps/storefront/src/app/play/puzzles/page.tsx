import type { Metadata } from "next"
import { Suspense } from "react"
import { PuzzlesHome } from "@/components/play/puzzles/puzzles-home"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"
import { seoMetadata } from "@/lib/seo"

export const generateMetadata = (): Promise<Metadata> =>
  seoMetadata({ path: "/play/puzzles", title: "Chess puzzles", description: "Daily chess puzzle, rated puzzle trainer, Puzzle Rush and tactics by theme." })

async function Home() {
  return <PuzzlesHome initialPass={await getPlayPass()} />
}

export default function PuzzlesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  )
}
