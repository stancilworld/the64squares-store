import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { TournamentRow } from "@/components/tournaments/tournament-row"
import { getTournaments } from "@/lib/tournaments"

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Online arenas and over-the-board chess tournaments from The 64 Squares. Register in a minute and get your ticket by email.",
}

async function List() {
  const { upcoming, past } = await getTournaments()
  return (
    <>
      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="font-display h-section">
          Coming up
        </h2>
        {upcoming.length ? (
          <ul className="mt-6 flex flex-col gap-3">
            {upcoming.map((t) => (
              <TournamentRow key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-md border border-dashed border-rule px-6 py-10 text-center">
            <p className="text-[16px]">No tournaments are open for registration right now.</p>
            <p className="mt-1 text-[15px] text-muted">New events are announced in our newsletter first.</p>
            <Link href="/#newsletter" className="btn btn-outline mt-5">
              Get the newsletter
            </Link>
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past" className="mt-16">
          <h2 id="past" className="font-display h-sub">
            Past tournaments
          </h2>
          <ul className="mt-5 flex flex-col gap-3">
            {past.slice(0, 12).map((t) => (
              <TournamentRow key={t.id} t={t} past />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function TournamentsPage() {
  return (
    <>
      <div className="bg-velvet text-white">
        <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
          <h1 className="font-display h-page">Tournaments</h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-[1.6] text-maple-soft/90">
            Online arenas and over-the-board opens. Register in a minute with your The 64 Squares account and your ticket arrives by email.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-10 lg:px-10 lg:pb-28 lg:pt-14">
        <Suspense fallback={<p className="text-muted">Loading tournaments…</p>}>
          <List />
        </Suspense>
      </div>
    </>
  )
}
