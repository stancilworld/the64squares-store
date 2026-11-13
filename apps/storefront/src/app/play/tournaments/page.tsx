import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PanelHeader } from "@/components/play-shell/nav"
import { type TimelineEvent, TournamentTimeline } from "@/components/tourney/timeline"
import { getMyPasses, getMyTickets } from "@/lib/tournament-actions"
import { eventDay, eventTime, estimatedEnd, FORMAT_COLOUR, speedLabel, type Tournament, type TourneySummary } from "@/lib/tournament-types"
import { getTournaments, getTourneySummaries } from "@/lib/tournaments"
import { Loading } from "../loading-text"
import { nowMs } from "@/lib/clock"

export const metadata: Metadata = {
  title: "Chess tournaments",
  description: "Free online chess tournaments with real prizes: Arena, Swiss and Knockout events every week on The 64 Squares.",
}

const IST_DAY = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms))

const phaseOf = (t: Tournament, s: TourneySummary | undefined, now: number): TimelineEvent["phase"] => {
  if (t.status === "cancelled" || s?.phase === "cancelled_low") return "cancelled"
  if (t.status === "completed" || s?.phase === "finished") return "over"
  const start = new Date(t.starts_at).getTime()
  if (now < start) return "upcoming"
  if (t.format === "arena") return now < estimatedEnd(t) ? "live" : "over"
  return s?.phase === "running" ? "live" : now < estimatedEnd(t) ? "live" : "over"
}

async function Hub() {
  const [{ upcoming, past }, summaries, tickets, passes] = await Promise.all([getTournaments(), getTourneySummaries(), getMyTickets(), getMyPasses()])
  const now = nowMs()
  const byId = new Map(summaries.map((s) => [s.id, s]))
  const online = [...upcoming, ...past].filter((t) => t.mode === "online")
  const events: TimelineEvent[] = online.map((t) => {
    const s = byId.get(t.id)
    return {
      id: t.id,
      handle: t.handle,
      title: t.title,
      format: t.format,
      format_label: t.format_label,
      time_control: t.time_control,
      speed: speedLabel(t.time_control),
      starts_at: new Date(t.starts_at).getTime(),
      ends_at: estimatedEnd(t),
      registered: t.registered,
      capacity: t.capacity,
      phase: phaseOf(t, s, now),
      live_games: s?.live_games ?? 0,
      leader: s?.leader ?? null,
      entry: t.entry,
      featured: t.featured,
    }
  })
  const today = IST_DAY(now)
  const todays = events.filter((e) => IST_DAY(e.starts_at) === today && e.phase !== "cancelled")
  const live = events.filter((e) => e.phase === "live")
  const next = events.filter((e) => e.phase === "upcoming").sort((a, b) => a.starts_at - b.starts_at)
  const featured = online.find((t) => t.featured && next.some((e) => e.id === t.id)) ?? online.find((t) => t.id === next[0]?.id)
  const offline = upcoming.filter((t) => t.mode === "offline")
  const finished = events.filter((e) => e.phase === "over").sort((a, b) => b.starts_at - a.starts_at).slice(0, 6)
  const mine = tickets.filter((x) => x.status === "confirmed" && x.tournament.mode === "online" && new Date(x.tournament.starts_at).getTime() + 6 * 3600_000 > now)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]">
            <span aria-hidden="true">🏆</span>
            {todays.length} {todays.length === 1 ? "tournament" : "tournaments"} today
          </h1>
          <p className="mt-1 text-[22px] font-bold text-[var(--g-muted)] sm:text-[28px]">
            {todays.reduce((s, e) => s + e.registered, 0).toLocaleString("en-IN")} players · {eventDay(new Date(now).toISOString())}
          </p>
        </div>
        <Link href="/play/my-tournaments" className="g-panel flex items-center gap-3 px-4 py-3 hover:brightness-110">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--g-accent)] text-[20px] font-extrabold text-black">{passes?.balance ?? "–"}</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">{passes ? `Tournament ${passes.balance === 1 ? "Pass" : "Passes"}` : "Tournament Passes"}</span>
            <span className="g-muted block text-[13px]">{passes ? "Your tickets and results" : "Sign in to get your free pass"}</span>
          </span>
        </Link>
      </header>

      <TournamentTimeline events={events} initialDay={today} />

      {live.length > 0 && (
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="flex items-center gap-2 text-[20px] font-extrabold">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff3b3b] motion-reduce:animate-none" /> Live now
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {live.map((e) => (
              <Link key={e.id} href={`/play/tournaments/${e.handle}`} className="g-panel group relative overflow-hidden p-4 hover:brightness-110">
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: FORMAT_COLOUR[e.format] }} />
                <span className="block truncate text-[17px] font-extrabold">{e.title}</span>
                <span className="g-muted mt-1 block text-[13px]">
                  {e.format_label} · {e.speed} {e.time_control} · {e.registered} players
                </span>
                <span className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#ff3b3b] px-3 py-1.5 text-[13px] font-bold text-white">Watch{e.live_games ? ` ${e.live_games} boards` : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section aria-labelledby="mine-h">
          <h2 id="mine-h" className="text-[20px] font-extrabold">
            Your tournaments
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {mine.map((x) => (
              <li key={x.id}>
                <Link href={`/play/tournaments/${x.tournament.handle}`} className="g-panel flex items-center justify-between gap-3 p-4 hover:brightness-110">
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-bold">{x.tournament.title}</span>
                    <span className="g-muted block text-[13px]">
                      {eventDay(x.tournament.starts_at)}, {eventTime(x.tournament.starts_at)} · Player ID {x.ticket_code}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-bold ${x.checked_in_at ? "bg-[var(--g-good)] text-black" : x.can_check_in ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel-3)]"}`}>
                    {x.checked_in_at ? "Checked in" : x.can_check_in ? "Check in now" : "Registered"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured && (
        <section aria-label="Next big event">
          <Link href={`/play/tournaments/${featured.handle}`} className="group relative block overflow-hidden rounded-2xl border border-[var(--g-line)]">
            {featured.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={featured.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />
            ) : (
              <span aria-hidden="true" className="absolute inset-0 opacity-30" style={{ background: `repeating-conic-gradient(#2a2a2a 0 25%, #1b1b1b 0 50%) 0 0/64px 64px` }} />
            )}
            <span className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-transparent" />
            <span className="relative block p-6 sm:p-10">
              <span className="inline-block rounded px-2 py-1 text-[12px] font-extrabold text-black" style={{ background: FORMAT_COLOUR[featured.format] }}>
                {featured.format_label}
              </span>
              <span className="mt-3 block max-w-[640px] text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[46px]">{featured.title}</span>
              {featured.tagline && <span className="mt-2 block max-w-[560px] text-[16px] text-white/75">{featured.tagline}</span>}
              <span className="mt-4 block text-[15px] font-semibold text-white/85">
                {eventDay(featured.starts_at)}, {eventTime(featured.starts_at)} · {speedLabel(featured.time_control)} {featured.time_control} · {featured.registered} registered
              </span>
              <span className="mt-5 inline-flex h-[46px] items-center rounded-lg bg-[var(--g-accent)] px-6 text-[15px] font-bold text-black">
                {featured.entry === "pass" ? "Register with a free pass" : "See details"}
              </span>
            </span>
          </Link>
        </section>
      )}

      {offline.length > 0 && (
        <section aria-labelledby="otb-h">
          <h2 id="otb-h" className="text-[20px] font-extrabold">
            Over-the-board events
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {offline.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.handle}`} className="g-panel flex items-center justify-between gap-4 p-4 hover:brightness-110">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold">{t.title}</span>
                  <span className="g-muted block text-[13px]">
                    {eventDay(t.starts_at)} · {t.venue?.split("\n")[0] ?? "Venue to be announced"}
                  </span>
                </span>
                <span className="g-muted shrink-0 text-[13px]">Details</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section aria-labelledby="res-h">
          <h2 id="res-h" className="text-[20px] font-extrabold">
            Recent results
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {finished.map((e) => (
              <li key={e.id}>
                <Link href={`/play/tournaments/${e.handle}`} className="g-panel flex h-full flex-col p-4 hover:brightness-110">
                  <span className="truncate text-[16px] font-bold">{e.title}</span>
                  <span className="g-muted text-[13px]">
                    {e.format_label} · {eventDay(new Date(e.starts_at).toISOString())}
                  </span>
                  <span className="mt-2 text-[14px] font-semibold text-[var(--g-accent)]">{e.leader ? `🏆 ${e.leader}` : e.phase === "cancelled" ? "Cancelled" : "Results"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function PlayTournamentsPage() {
  return (
    <div className="mx-auto max-w-[1180px] pb-10">
      <PanelHeader title="Tournaments" right={<Link href="/play/rules?ch=tournament-rules" className="g-btn g-btn-ghost !min-h-[36px] !px-3 !text-[13px]">Rule book</Link>} />
      <div className="mt-5">
        <Suspense fallback={<Loading text="Loading tournaments…" />}>
          <Hub />
        </Suspense>
      </div>
    </div>
  )
}
