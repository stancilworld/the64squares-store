import type { Metadata } from "next"
import { NewGame } from "@/components/play/new-game"
import { PreviewLayout } from "@/components/play/preview-board"
import { getPlayPass } from "@/lib/play"
import { PlayShell } from "../shell"

export const metadata: Metadata = { title: "Play a friend", description: "Create a chess game and send the link to a friend." }

async function Friend() {
  const pass = await getPlayPass()
  return <PreviewLayout myName={pass?.me.name} panel={<NewGame token={pass?.token ?? null} />} />
}

export default function FriendPage() {
  return (
    <PlayShell>
      <Friend />
    </PlayShell>
  )
}
