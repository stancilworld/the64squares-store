import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { NewGame } from "@/components/play/new-game"
import { getPlayPass } from "@/lib/play"

export const metadata: Metadata = {
  title: "Play chess",
  description: "Play a friend at chess on The 64 Squares: pick a time control, send the link, play with live clocks.",
}

async function Start() {
  const pass = await getPlayPass()
  if (!pass) {
    return (
      <div className="rounded-md border border-rule p-6">
        <h2 className="font-display h-sub">Play a friend</h2>
        <p className="mt-2 text-[15px] text-muted">Sign in or create a free account to start a game. Your games are saved to your account.</p>
        <Link href="/account?next=/play" className="btn btn-solid mt-5 w-full">
          Sign in to play
        </Link>
      </div>
    )
  }
  return <NewGame token={pass.token} />
}

export default function PlayPage() {
  return (
    <>
      <div className="bg-velvet text-white">
        <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
          <h1 className="font-display h-page">Play</h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-[1.6] text-maple-soft/90">
            Live games with real clocks. Every move is checked on our server, and every game is saved.
          </p>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1100px] gap-8 px-6 pb-20 pt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10 lg:pb-28 lg:pt-14">
        <Suspense fallback={<div className="h-[420px] rounded-md border border-rule" />}>
          <Start />
        </Suspense>
        <div className="rounded-md bg-maple-soft p-6">
          <h2 className="font-display h-sub">Tournaments</h2>
          <p className="mt-2 text-[15px]">Play rated events against players from across India. Online arenas are free to enter.</p>
          <Link href="/tournaments" className="btn btn-outline mt-5 w-full">
            See tournaments
          </Link>
        </div>
      </div>
    </>
  )
}
