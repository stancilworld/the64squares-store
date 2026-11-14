"use client"

import { useState } from "react"
import { SITE_URL } from "@/lib/site"
import { eventDay, eventTime, type Tournament, type TourneyView } from "@/lib/tournament-types"

// Scheduled tournaments: the round times, the player's own next match, and WhatsApp share
// buttons (plain wa.me links, nothing is sent by us).

const at = (ms: number | null | undefined) => (ms ? `${eventDay(new Date(ms).toISOString())}, ${eventTime(new Date(ms).toISOString())}` : "after the previous round")

const pageUrl = (t: Tournament) => `${SITE_URL}/play/tournaments/${t.handle}`

export const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

// The player's next game: the upcoming Swiss / round-robin round, or their first knockout
// match while the bracket waits to start.
export const myMatch = (view: TourneyView | null, meId: string | null) => {
  if (!view || !meId) return null
  const up = view.upcoming
  if (up) {
    const g = up.games.find((x) => x.white?.id === meId || x.black?.id === meId)
    if (!g) return null
    const white = g.white?.id === meId
    const opp = white ? g.black : g.white
    return { round: up.round, label: `Round ${up.round}`, at: up.at, opponent: opp?.name ?? null, colour: opp ? (white ? "White" : "Black") : null, board: g.board }
  }
  if (view.format === "knockout" && view.state?.phase === "locked" && view.bracket) {
    const r = view.bracket.rounds[0]
    const m = r?.matches.find((x) => x.a?.id === meId || x.b?.id === meId)
    if (!m) return null
    const opp = m.a?.id === meId ? m.b : m.a
    return { round: 1, label: r.name, at: view.round_times?.[0] ?? null, opponent: opp?.name ?? null, colour: null, board: m.board }
  }
  return null
}

export function ScheduleCard({ t, view, meId, registered }: { t: Tournament; view: TourneyView | null; meId: string | null; registered: boolean }) {
  const [copied, setCopied] = useState(false)
  const times = view?.round_times?.length ? view.round_times : (t.round_times ?? []).map((x) => new Date(x).getTime())
  const mine = registered ? myMatch(view, meId) : null
  const join = view?.join_minutes ?? t.join_minutes ?? 5
  const locked = !!view?.state
  const doneRounds = view?.state?.phase === "running" ? view.state.round - (view.state.round_done_at ? 0 : 1) : 0

  const invite = [
    `♟ ${t.title}`,
    `${t.format_label} · ${t.time_control} · starts ${at(new Date(t.starts_at).getTime())}`,
    t.registration_open ? "Register free here:" : "Follow it live here:",
    pageUrl(t),
  ].join("\n")
  const matchText = mine
    ? [
        `♟ My match in ${t.title}`,
        `${mine.label}${mine.opponent ? ` vs ${mine.opponent}` : ": I have a bye"}`,
        mine.at ? at(mine.at) : "",
        `Watch live: ${pageUrl(t)}/lobby`,
      ]
        .filter(Boolean)
        .join("\n")
    : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl(t))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5">
      {mine && (
        <div className="mb-4 rounded-lg border border-[var(--g-accent)]/50 bg-[var(--g-accent)]/10 p-4">
          <p className="text-[13px] font-semibold text-[var(--g-muted)]">Your next match</p>
          <p className="mt-1 text-[18px] font-extrabold">
            {mine.label}
            {mine.opponent ? ` vs ${mine.opponent}` : ": you have a bye (a free point)"}
          </p>
          {mine.opponent && (
            <p className="mt-1 text-[14px]">
              {at(mine.at)}
              {mine.colour ? ` · you play ${mine.colour}` : ""}
            </p>
          )}
          {mine.opponent && (
            <p className="mt-2 text-[13px] leading-relaxed text-white/75">
              Be in the lobby at that time. Your board opens there and you have {join} minutes to press Ready, or the game is lost.
            </p>
          )}
          {matchText && (
            <a href={whatsapp(matchText)} target="_blank" rel="noopener noreferrer" className="g-btn mt-3 w-full">
              Share my match on WhatsApp
            </a>
          )}
        </div>
      )}

      <p className="text-[16px] font-extrabold">Match schedule</p>
      <p className="mt-1 text-[13px] text-[var(--g-muted)]">
        {locked
          ? "Registration is closed and the pairings are out."
          : `Register before ${at(view?.locks_at ?? (t.registration_closes_at ? new Date(t.registration_closes_at).getTime() : null))}. The pairings come out then.`}{" "}
        No check-in: be on time for your match.
      </p>
      {times.length > 0 && (
        <ol className="mt-3 space-y-2 text-[14px]">
          {times.map((ms, i) => (
            <li key={i} className={`flex justify-between gap-3 ${i < doneRounds ? "text-[var(--g-muted)] line-through" : ""}`}>
              <span className="font-semibold">Round {i + 1}</span>
              <span className="text-right">{at(ms)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex gap-2">
        <a href={whatsapp(invite)} target="_blank" rel="noopener noreferrer" className="g-btn g-btn-primary flex-1 whitespace-nowrap">
          Share on WhatsApp
        </a>
        <button type="button" onClick={copy} className="g-btn whitespace-nowrap">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
}
