import type { Metadata } from "next"
import { Suspense } from "react"
import { PuzzleTrainer } from "@/components/play/puzzles/trainer"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Puzzle trainer", robots: { index: false } }

async function Train({ searchParams }: PageProps<"/play/puzzles/train">) {
  const [sp, pass] = await Promise.all([searchParams, getPlayPass()])
  const theme = typeof sp.theme === "string" && /^[A-Za-z0-9]{2,30}$/.test(sp.theme) ? sp.theme : null
  return <PuzzleTrainer key={theme ?? "all"} mode={{ kind: "train", theme }} initialPass={pass} />
}

export default function TrainPage(props: PageProps<"/play/puzzles/train">) {
  return (
    <Suspense fallback={<Loading />}>
      <Train {...props} />
    </Suspense>
  )
}
