import type { Metadata } from "next"
import { FideRankings } from "@/components/play/fide-rankings"
import { LeaderboardSwitch } from "@/components/play/leaderboard-switch"
import { PanelHeader } from "@/components/play-shell/nav"

export const metadata: Metadata = { title: "FIDE rankings", description: "FIDE's official top 100: open, women, juniors and India, for standard, rapid and blitz." }

export default function FidePage() {
  return (
    <div className="mx-auto max-w-[860px]">
      <PanelHeader title="Leaderboard" />
      <div className="mt-3">
        <LeaderboardSwitch on="fide" />
      </div>
      <p className="g-muted mt-3 text-[14px]">FIDE&apos;s official top 100 active players, updated every month.</p>
      <div className="mt-5">
        <FideRankings />
      </div>
    </div>
  )
}
