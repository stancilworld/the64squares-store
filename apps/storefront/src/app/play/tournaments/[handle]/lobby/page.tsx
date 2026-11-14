import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { LobbyScreen, type RuleChapter } from "@/components/lobby/lobby-screen"
import { getSitePage } from "@/lib/data"
import { getPlayPass } from "@/lib/play"
import { seoMetadata } from "@/lib/seo"
import { getMyTickets } from "@/lib/tournament-actions"
import { getTournament, getTourneyView } from "@/lib/tournaments"
import { Loading } from "../../../loading-text"

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTournament((await params).handle)
  if (!t) return { title: "Lobby" }
  return { ...(await seoMetadata({ path: `/play/tournaments/${t.handle}/lobby`, title: `${t.title}: lobby`, description: `Live boards, standings and chat for ${t.title}.` })), robots: { index: false } }
}

const CHAPTERS = [
  { handle: "tournament-rules", label: "Tournament rules" },
  { handle: "chess-rules", label: "Rules of chess" },
  { handle: "playing-guide", label: "Playing here" },
  { handle: "fair-play", label: "Fair play" },
]

async function Screen({ params, searchParams }: Props) {
  const [{ handle }, sp] = await Promise.all([params, searchParams])
  const game = typeof sp.game === "string" && /^[A-Za-z0-9]{6,20}$/.test(sp.game) ? sp.game : null
  const t = await getTournament(handle)
  if (!t) notFound()
  if (t.mode === "offline") redirect(`/tournaments/${t.handle}`)
  if (handle !== t.handle) redirect(`/play/tournaments/${t.handle}/lobby`)
  const [pass, view, tickets, ...pages] = await Promise.all([getPlayPass(), getTourneyView(t.id), getMyTickets(), ...CHAPTERS.map((c) => getSitePage(c.handle))])
  const chapters: RuleChapter[] = CHAPTERS.flatMap((c, i) => (pages[i] ? [{ handle: c.handle, label: c.label, title: pages[i]!.title, body: pages[i]!.body }] : []))
  const ticket = tickets.find((x) => x.tournament.id === t.id && x.status === "confirmed") ?? null
  return <LobbyScreen t={t} initialView={view} pass={pass} ticket={ticket} chapters={chapters} initialGame={game} />
}

export default function LobbyPage(props: Props) {
  return (
    <Suspense fallback={<Loading text="Opening the lobby…" />}>
      <Screen {...props} />
    </Suspense>
  )
}
