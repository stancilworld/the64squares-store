import type { Metadata } from "next"
import { Suspense } from "react"
import { NewGame } from "@/components/play/new-game"
import { PreviewLayout } from "@/components/play/preview-board"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Play a friend", description: "Create a chess game and send the link to a friend." }

async function Friend() {
  const pass = await getPlayPass()
  return <PreviewLayout myName={pass?.me.name} panel={<NewGame token={pass?.token ?? null} />} />
}

export default function FriendPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Friend />
    </Suspense>
  )
}
