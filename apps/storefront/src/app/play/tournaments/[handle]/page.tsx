import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import QRCode from "qrcode"
import { Suspense } from "react"
import { PanelHeader } from "@/components/play-shell/nav"
import { TourneyScreen } from "@/components/tourney/tourney-screen"
import { GAME_URL } from "@/lib/game-types"
import { getPlayPass } from "@/lib/play"
import { absoluteUrl, jsonLd, seoMetadata } from "@/lib/seo"
import { getMyPasses, getMyTickets, getPlayerProfile } from "@/lib/tournament-actions"
import { estimatedEnd } from "@/lib/tournament-types"
import { getTournament, getTournamentPlayers, getTourneyView } from "@/lib/tournaments"
import { Loading } from "../../loading-text"

export async function generateMetadata({ params }: PageProps<"/play/tournaments/[handle]">): Promise<Metadata> {
  const t = await getTournament((await params).handle)
  if (!t) return { title: "Tournament" }
  return seoMetadata({
    path: `/play/tournaments/${t.handle}`,
    title: t.title,
    description: t.tagline || t.summary || `${t.format_label} chess tournament on The 64 Squares, ${t.time_control}. Free entry with a Tournament Pass; real prizes.`,
    image: t.image_url,
  })
}

async function Screen({ params }: PageProps<"/play/tournaments/[handle]">) {
  const { handle } = await params
  const t = await getTournament(handle)
  if (!t) notFound()
  // Venue events keep their own page in the shop.
  if (t.mode === "offline") redirect(`/tournaments/${t.handle}`)
  if (handle !== t.handle) redirect(`/play/tournaments/${t.handle}`)
  const [pass, view, players, tickets, passes, profile] = await Promise.all([
    getPlayPass(),
    getTourneyView(t.id),
    getTournamentPlayers(t.handle),
    getMyTickets(),
    getMyPasses(),
    getPlayerProfile(),
  ])
  const ticket = tickets.find((x) => x.tournament.id === t.id && x.status !== "cancelled") ?? null
  const ticketQr = ticket
    ? await QRCode.toString(absoluteUrl(`/play/tournaments/${t.handle}?player=${ticket.ticket_code}`), { type: "svg", margin: 0, errorCorrectionLevel: "M" })
    : null
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "Event",
          name: t.title,
          description: t.tagline || t.summary || undefined,
          startDate: t.starts_at,
          endDate: new Date(estimatedEnd(t)).toISOString(),
          eventStatus: t.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          location: { "@type": "VirtualLocation", url: absoluteUrl(`/play/tournaments/${t.handle}`) },
          image: t.image_url ? [absoluteUrl(t.image_url)] : undefined,
          organizer: { "@type": "Organization", name: "The 64 Squares", url: absoluteUrl("/") },
          offers: { "@type": "Offer", price: 0, priceCurrency: "INR", availability: t.registration_open ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url: absoluteUrl(`/play/tournaments/${t.handle}`) },
        })}
      />
      <TourneyScreen
        t={t}
        initialView={view}
        players={players}
        token={pass?.token ?? null}
        meId={pass?.me.id ?? null}
        ticket={ticket}
        ticketQr={ticketQr}
        passes={passes}
        profileComplete={!!profile?.complete}
        avatarBase={`${GAME_URL}/game/avatars`}
      />
    </>
  )
}

export default function TournamentPage(props: PageProps<"/play/tournaments/[handle]">) {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PanelHeader title="Tournament" back="/play/tournaments" backLabel="Tournaments" />
      <div className="mt-4">
        <Suspense fallback={<Loading text="Opening the tournament…" />}>
          <Screen {...props} />
        </Suspense>
      </div>
    </div>
  )
}
