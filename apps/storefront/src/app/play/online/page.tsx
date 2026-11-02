import type { Metadata } from "next"
import { Suspense } from "react"
import { FindGame } from "@/components/play/find-game"
import { PreviewLayout } from "@/components/play/preview-board"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Play online", description: "Rated chess games against players of similar strength." }

async function Online() {
  const pass = await getPlayPass()
  return <PreviewLayout myName={pass?.me.name} panel={<FindGame token={pass?.token ?? null} meId={pass?.me.id ?? null} />} />
}

export default function OnlinePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Online />
    </Suspense>
  )
}
