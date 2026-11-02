import type { Metadata } from "next"
import { ComputerGame } from "@/components/play/computer-game"
import { getPlayPass } from "@/lib/play"
import { PlayShell } from "../shell"

export const metadata: Metadata = { title: "Play the computer", description: "Play chess against the computer at eight levels, from beginner to master." }

async function Computer() {
  const pass = await getPlayPass()
  return <ComputerGame token={pass?.token ?? null} myName={pass?.me.name ?? null} />
}

export default function ComputerPage() {
  return (
    <PlayShell>
      <Computer />
    </PlayShell>
  )
}
