import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { RichText } from "@/components/rich-text"
import { RegisterPanel } from "@/components/tournaments/register-panel"
import { getCustomer } from "@/lib/auth"
import { formatPrice } from "@/lib/format"
import { getMyTickets } from "@/lib/tournament-actions"
import { eventDate, eventTime, ratingText, type Tournament } from "@/lib/tournament-types"
import { getTournament } from "@/lib/tournaments"

export async function generateMetadata({ params }: PageProps<"/tournaments/[handle]">): Promise<Metadata> {
  const t = await getTournament((await params).handle)
  return t ? { title: t.title, description: t.summary ?? undefined } : { title: "Tournament" }
}


function Facts({ t }: { t: Tournament }) {
  const rows: [string, string][] = [
    ["Date", eventDate(t.starts_at)],
    ["Time", `${eventTime(t.starts_at)}${t.ends_at ? ` to ${eventTime(t.ends_at)}` : ""}`],
    ["Where", t.mode === "online" ? "Online, on The 64 Squares" : t.venue ?? "Venue to be announced"],
    ["Format", `${t.format_label}${t.rounds ? `, ${t.rounds} rounds` : ""}`],
    ["Time control", `${t.time_control} (minutes + seconds per move)`],
    ["Entry", t.entry_fee > 0 ? `${formatPrice(t.entry_fee)}${t.mode === "offline" ? ", paid at the venue" : ""}` : "Free"],
    ["Who can play", ratingText(t)],
    [
      "Places",
      t.capacity != null ? `${t.registered} of ${t.capacity} taken` : `${t.registered} registered`,
    ],
  ]
  if (t.registration_closes_at) rows.splice(2, 0, ["Registration closes", `${eventDate(t.registration_closes_at)}, ${eventTime(t.registration_closes_at)}`])
  return (
    <dl className="divide-y divide-rule border-y border-rule text-[15px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-muted">{k}</dt>
          <dd className="whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

async function Panel({ t }: { t: Tournament }) {
  const customer = await getCustomer()
  const ticket = customer ? (await getMyTickets()).find((x) => x.tournament.id === t.id) ?? null : null
  const me = customer
    ? {
        name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        email: customer.email,
        phone: customer.phone ?? null,
      }
    : null
  return <RegisterPanel t={t} me={me} ticket={ticket} />
}

async function TournamentDetail({ params }: PageProps<"/tournaments/[handle]">) {
  const t = await getTournament((await params).handle)
  if (!t) notFound()

  return (
    <>
      <div className="board-wash overflow-hidden bg-ink text-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-6 pb-0 pt-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-10 lg:pt-12">
          <div className="pb-8 lg:pb-12">
            <Link href="/tournaments" className="text-[14px] text-white/60 hover:underline">
              Tournaments
            </Link>
            <h1 className="font-display h-page mt-3 text-balance">{t.title}</h1>
            {t.summary && <p className="mt-4 max-w-[600px] text-[17px] leading-[1.6] text-white/75">{t.summary}</p>}
            <p className="mt-6 inline-block bg-amber px-3 py-1.5 text-[15px] font-bold text-black">
              {eventDate(t.starts_at)}, {eventTime(t.starts_at)}
            </p>
            {t.status === "cancelled" && (
              <p className="mt-4 inline-block rounded bg-white px-3 py-1 text-[14px] font-medium text-love">This tournament was cancelled.</p>
            )}
          </div>
          {t.image_url ? (
            <div className="relative hidden aspect-[4/3] self-end overflow-hidden rounded-t-md lg:block">
              <Image src={t.image_url} alt="" fill sizes="420px" className="object-cover" priority />
            </div>
          ) : (
            <div aria-hidden="true" className="relative hidden self-end lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/play-art/bQ.webp" alt="" className="ml-auto h-[230px] w-auto translate-y-[14%] drop-shadow-[0_20px_24px_rgba(0,0,0,0.6)]" />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-20 pt-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-10 lg:pb-28">
        <div className="lg:order-2">
          <div className="lg:sticky lg:top-[100px]">
            <Suspense fallback={<div className="h-[320px] rounded-md border border-rule" />}>
              <Panel t={t} />
            </Suspense>
          </div>
        </div>
        <div className="min-w-0 lg:order-1">
          <Facts t={t} />
          {t.description && (
            <section className="mt-10">
              <h2 className="font-display h-section">About this tournament</h2>
              <div className="mt-4 max-w-[68ch] text-[16px] leading-[1.7]">
                <RichText text={t.description} />
              </div>
            </section>
          )}
          {t.prizes && (
            <section className="mt-10">
              <h2 className="font-display h-section">Prizes</h2>
              <ul className="mt-4 divide-y divide-rule border-y border-rule text-[16px]">
                {t.prizes
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l) => (
                    <li key={l} className="py-3">
                      {l}
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {t.rules && (
            <section className="mt-10">
              <h2 className="font-display h-section">Rules</h2>
              <div className="mt-4 max-w-[68ch] text-[15px] leading-[1.7]">
                <RichText text={t.rules} />
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

export default function TournamentPage(props: PageProps<"/tournaments/[handle]">) {
  return (
    <Suspense fallback={<div className="h-[600px] bg-ink" />}>
      <TournamentDetail {...props} />
    </Suspense>
  )
}
