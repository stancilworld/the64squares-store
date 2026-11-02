import type { Metadata } from "next"
import { Suspense } from "react"
import { PlayHub } from "@/components/play/play-hub"
import { getPlayPass } from "@/lib/play"
import { Loading } from "./loading-text"

export const metadata: Metadata = {
  title: { absolute: "Play chess online | The 64 Squares" },
  description: "Play chess on The 64 Squares: rated games online, eight computer levels, games with friends, and free online tournaments.",
}

async function Hub() {
  const pass = await getPlayPass()
  return <PlayHub meId={pass?.me.id ?? null} myName={pass?.me.name ?? null} />
}

export default function PlayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Hub />
    </Suspense>
  )
}
