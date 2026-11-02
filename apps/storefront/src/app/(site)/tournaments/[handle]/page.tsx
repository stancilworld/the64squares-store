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

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]

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
      <div className="bg-velvet text-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-6 pb-0 pt-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-10 lg:pt-12">
          <div className="pb-8 lg:pb-12">
            <Link href="/tournaments" className="text-[14px] text-maple hover:underline">
              Tournaments
            </Link>
            <h1 className="font-display h-page mt-3 text-balance">{t.title}</h1>
            {t.summary && <p className="mt-4 max-w-[600px] text-[17px] leading-[1.6] text-maple-soft/90">{t.summary}</p>}
            <p className="mt-6 text-[15px]">
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
            <div aria-hidden="true" className="hidden self-end lg:block">
              <div className="grid aspect-[2/1] grid-cols-8 grid-rows-4 overflow-hidden rounded-t-md">
                {Array.from({ length: 32 }, (_, i) => (
                  <span key={i} className={(Math.floor(i / 8) + i) % 2 ? "bg-velvet-deep" : "bg-white/10"} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div aria-hidden="true" className="mx-auto grid max-w-[1440px] grid-cols-8 border-t border-white/10 px-6 lg:px-10">
          {FILES.map((f) => (
            <span key={f} className="py-2 text-center font-display text-[14px] italic text-brass">
              {f}
            </span>
          ))}
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
    <Suspense fallback={<div className="h-[600px] bg-velvet" />}>
      <TournamentDetail {...props} />
    </Suspense>
  )
}
