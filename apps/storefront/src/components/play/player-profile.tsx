"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { liveCall } from "@/components/play-shell/live"
import { PanelHeader } from "@/components/play-shell/nav"
import { GAME_URL, SPEED_LABEL } from "@/lib/game-types"
import type { FullProfile } from "@/lib/profile-types"
import { Avatar, LevelBadge, XpBar } from "./avatar"
import { openChallenge } from "./challenge-dialog"
import { HistoryList } from "./history-list"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso))

// A player's public page: picture, level, ratings, results and recent games.
export function PlayerProfile({ username, meId }: { username: string; meId: string | null }) {
  const [p, setP] = useState<FullProfile | null | "missing">(null)
  const [relation, setRelation] = useState<string | null>(null)
  const pid = p && p !== "missing" ? p.player_id : null
  useEffect(() => {
    if (!pid || !meId) return
    liveCall<{ ok: boolean; relation?: string }>("friends:relation", pid).then((r) => r.ok && setRelation(r.relation ?? null))
  }, [pid, meId])

  useEffect(() => {
    let live = true
    fetch(`${GAME_URL}/game/profiles/${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setP(d?.profile ?? "missing"))
      .catch(() => live && setP("missing"))
    return () => {
      live = false
    }
  }, [username])

  if (p === "missing") return <p className="g-muted py-16 text-center">We couldn&apos;t find that player.</p>
  if (!p) return <p className="g-muted py-16 text-center">Loading…</p>

  const total = p.stats.people
  const pct = (n: number) => (total.games ? Math.round((n / total.games) * 100) : 0)

  return (
    <div className="mx-auto max-w-[980px]">
      <PanelHeader title={p.display_name} back="/play/friends" backLabel="Friends" />
      <div className="g-panel mt-5 overflow-hidden">
        <div className="h-[84px] bg-gradient-to-r from-[#2c4a39] via-[#3a5a46] to-[#5c3b22]" />
        <div className="-mt-12 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="rounded-xl border-4 border-[var(--g-panel)]">
            <Avatar url={p.avatar_url} name={p.display_name} size={104} online={p.online} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[24px] font-bold leading-tight">{p.display_name}</p>
            <p className="g-muted text-[14px]">
              @{p.username}
              {p.city ? ` · ${p.city}` : ""} · joined {when(p.joined)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <LevelBadge level={p.level} />
              <span className={`text-[12px] font-semibold ${p.online ? "text-[#5fd07a]" : "g-muted"}`}>{p.online ? "● Online" : "Offline"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!meId ? (
              <Link href="/account?next=/play/friends" className="g-btn text-[14px]">
                Sign in to add friends
              </Link>
            ) : relation === "self" ? (
              <Link href="/play/profile" className="g-btn text-[14px]">
                Edit profile
              </Link>
            ) : relation === "friends" ? (
              <>
                <button type="button" disabled={!p.online} className="g-btn g-btn-primary text-[14px]" onClick={() => openChallenge(p)}>
                  Challenge
                </button>
                <span className="g-btn g-btn-ghost pointer-events-none text-[14px]">Friends ✓</span>
              </>
            ) : relation === "requested" ? (
              <span className="g-btn g-btn-ghost pointer-events-none text-[14px]">Request sent</span>
            ) : relation ? (
              <button
                type="button"
                className="g-btn g-btn-primary text-[14px]"
                onClick={async () => {
                  const r = await liveCall<{ ok: boolean; relation?: string }>("friends:request", p.player_id)
                  if (r.ok) setRelation(r.relation ?? "requested")
                }}
              >
                {relation === "incoming" ? "Accept friend request" : "Add friend"}
              </button>
            ) : null}
          </div>
        </div>
        {p.bio && <p className="border-t border-[var(--g-line)] px-6 py-4 text-[15px]">{p.bio}</p>}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="g-panel p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Experience</p>
          <p className="mt-2 text-[28px] font-bold">
            Level {p.level.level} <span className="text-[18px] font-semibold text-[var(--g-muted)]">· {p.level.title}</span>
          </p>
          <div className="mt-2">
            <XpBar level={p.level} />
          </div>
          <p className="g-muted mt-3 text-[13px]">{p.xp} XP from {total.games + p.stats.computer.games} games</p>
        </div>
        <div className="g-panel p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Ratings</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["bullet", "blitz", "rapid", "classical"] as const).map((s) => {
              const r = p.ratings.find((x) => x.speed === s)
              return (
                <div key={s} className="rounded-lg bg-[var(--g-panel-2)] px-3 py-2">
                  <p className="g-muted text-[12px]">{SPEED_LABEL[s]}</p>
                  <p className="text-[20px] font-bold">
                    {r ? r.rating : "—"}
                    {r?.provisional && <span className="g-muted text-[14px]">?</span>}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="g-panel mt-4 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Results against people</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--g-panel-3)]">
          <div className="bg-[#5fae6c]" style={{ width: `${pct(total.wins)}%` }} />
          <div className="bg-[#9a948c]" style={{ width: `${pct(total.draws)}%` }} />
          <div className="bg-[#c4483d]" style={{ width: `${pct(total.losses)}%` }} />
        </div>
        <p className="mt-2 text-[14px]">
          <b>{total.games}</b> games · <span className="text-[#7bd88f]">{total.wins} won</span> · <span className="g-muted">{total.draws} drawn</span> ·{" "}
          <span className="text-[#ff8a7d]">{total.losses} lost</span>
        </p>
      </div>

      <h2 className="g-title mt-6">Recent games</h2>
      <div className="mt-3">
        <HistoryList playerId={p.player_id} />
      </div>
    </div>
  )
}
