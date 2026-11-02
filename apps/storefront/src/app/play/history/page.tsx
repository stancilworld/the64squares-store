import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { HistoryList } from "@/components/play/history-list"
import { PanelHeader } from "@/components/play-shell/nav"
import { getPlayPass } from "@/lib/play"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Game history", robots: { index: false } }

async function History() {
  const pass = await getPlayPass()
  if (!pass)
    return (
      <div className="g-panel p-8 text-center">
        <p className="text-[16px]">Sign in to see your games.</p>
        <Link href="/account?next=/play/history" className="g-btn g-btn-primary mt-5">
          Sign in
        </Link>
      </div>
    )
  return <HistoryList playerId={pass.me.id} />
}

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-[980px]">
      <PanelHeader title="Game history" />
      <p className="g-muted mt-2 text-[14px]">Your finished games, newest first. Open any game to replay it move by move.</p>
      <div className="mt-5">
        <Suspense fallback={<Loading />}>
          <History />
        </Suspense>
      </div>
    </div>
  )
}
