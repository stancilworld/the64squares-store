import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PanelHeader } from "@/components/play-shell/nav"
import { eventDay, eventTime } from "@/lib/tournament-types"
import { getTournaments } from "@/lib/tournaments"
import { Loading } from "../loading-text"

export const metadata: Metadata = { title: "Tournaments", description: "Free online chess arenas on The 64 Squares." }

async function List() {
  const { upcoming, past } = await getTournaments()
  const online = upcoming.filter((t) => t.mode === "online" && t.format === "arena")
  const offline = upcoming.filter((t) => t.mode === "offline")
  const finished = past.filter((t) => t.mode === "online" && t.format === "arena").slice(0, 6)
  const row = (t: (typeof upcoming)[number], note: string) => (
    <Link key={t.id} href={`/play/arena/${t.handle}`} className="g-panel flex items-center gap-4 p-4 transition hover:brightness-110">
      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-[var(--g-panel-3)] text-center">
        <span className="text-[11px] font-semibold uppercase text-[var(--g-gold)]">{eventDay(t.starts_at).split(",")[0]}</span>
        <span className="text-[13px] font-bold leading-tight">{eventTime(t.starts_at).replace(" IST", "")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{t.title}</span>
        <span className="g-muted block text-[13px]">
          Arena · {t.time_control} · {t.registered} registered
        </span>
      </span>
      <span className="g-btn !min-h-[38px] text-[13px]">{note}</span>
    </Link>
  )
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Online arenas</h2>
        <div className="mt-3 flex flex-col gap-2">
          {online.length ? online.map((t) => row(t, "Open")) : <p className="g-panel g-muted p-6 text-center">No online arenas scheduled right now. Check back soon.</p>}
        </div>
      </section>
      {offline.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Over-the-board events</h2>
          <div className="mt-3 flex flex-col gap-2">
            {offline.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.handle}`} className="g-panel flex items-center justify-between gap-4 p-4 hover:brightness-110">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold">{t.title}</span>
                  <span className="g-muted block text-[13px]">
                    {eventDay(t.starts_at)} · {t.venue ?? "Venue to be announced"}
                  </span>
                </span>
                <span className="g-muted shrink-0 text-[13px]">Details →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {finished.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Finished</h2>
          <div className="mt-3 flex flex-col gap-2">{finished.map((t) => row(t, "Results"))}</div>
        </section>
      )}
    </div>
  )
}

export default function PlayTournamentsPage() {
  return (
    <div className="mx-auto max-w-[860px]">
      <PanelHeader title="Tournaments" />
      <p className="g-muted mt-2 text-[14px]">Online arenas are free to enter. Join any time while the arena runs; you&apos;re paired again after every game.</p>
      <div className="mt-5">
        <Suspense fallback={<Loading />}>
          <List />
        </Suspense>
      </div>
    </div>
  )
}
