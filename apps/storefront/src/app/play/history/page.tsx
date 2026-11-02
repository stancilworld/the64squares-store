import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { HistoryList } from "@/components/play/history-list"
import { getPlayPass } from "@/lib/play"

export const metadata: Metadata = { title: "Game history", robots: { index: false } }

async function History() {
  const pass = await getPlayPass()
  if (!pass)
    return (
      <div className="rounded-md border border-rule p-6 text-center">
        <p className="text-[16px]">Sign in to see your games.</p>
        <Link href="/account?next=/play/history" className="btn btn-solid mt-5">
          Sign in
        </Link>
      </div>
    )
  return <HistoryList playerId={pass.me.id} />
}

export default function HistoryPage() {
  return (
    <section className="mx-auto max-w-[960px] px-4 pb-16 pt-8 sm:px-6 lg:pb-24 lg:pt-12">
      <p className="text-[14px]">
        <Link href="/play" className="text-muted underline-offset-4 hover:underline">
          Play
        </Link>
      </p>
      <h1 className="font-display h-page mt-1">Game history</h1>
      <p className="mt-2 text-[15px] text-muted">Your finished games, newest first. Open any game to replay it move by move.</p>
      <div className="mt-6">
        <Suspense fallback={<p className="py-10 text-center text-muted">Loading…</p>}>
          <History />
        </Suspense>
      </div>
    </section>
  )
}
