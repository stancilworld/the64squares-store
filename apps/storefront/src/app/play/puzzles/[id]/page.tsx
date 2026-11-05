import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PuzzleTrainer } from "@/components/play/puzzles/trainer"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../../loading-text"

export const metadata: Metadata = { title: "Chess puzzle" }

async function One({ params }: PageProps<"/play/puzzles/[id]">) {
  const { id } = await params
  if (!/^[A-Za-z0-9]{3,12}$/.test(id)) notFound()
  return <PuzzleTrainer mode={{ kind: "one", id }} initialPass={await getPlayPass()} />
}

export default function OnePuzzlePage(props: PageProps<"/play/puzzles/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <One {...props} />
    </Suspense>
  )
}
