import type { Metadata } from "next"
import { Suspense } from "react"
import { Friends } from "@/components/play/friends"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Friends", robots: { index: false } }

async function List() {
  const pass = await getPlayPass()
  return <Friends signedIn={!!pass} />
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <List />
    </Suspense>
  )
}
