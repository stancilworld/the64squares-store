"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { liveCall } from "@/components/play-shell/live"
import { PanelHeader } from "@/components/play-shell/nav"
import type { PublicProfile } from "@/lib/profile-types"
import { Avatar, LevelBadge } from "./avatar"
import { openChallenge } from "./challenge-dialog"

type Friend = PublicProfile & { playing?: string | null }
type Lists = { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }
type Tab = "friends" | "requests" | "find"

const statusOf = (f: Friend) =>
  f.playing ? <span className="text-[var(--g-gold)]">● Playing now</span> : f.online ? <span className="text-[#5fd07a]">● Online</span> : <span className="g-muted">Offline</span>

function Card({ p, children, sub }: { p: Friend; children?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="g-panel flex items-center gap-3 p-3 sm:p-4">
      <Link href={`/play/player/${p.username}`} className="shrink-0">
        <Avatar url={p.avatar_url} name={p.display_name} size={52} online={p.online} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/play/player/${p.username}`} className="flex items-center gap-2">
          <span className="truncate text-[16px] font-bold hover:underline">{p.display_name}</span>
          {p.level && <LevelBadge level={p.level} compact />}
        </Link>
        <p className="g-muted truncate text-[13px]">
          @{p.username}
          {p.city ? ` · ${p.city}` : ""}
        </p>
        {sub && <p className="mt-0.5 text-[12px] font-semibold">{sub}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}

// Friends, friend requests, and finding players to add — like a social app.
export function Friends({ signedIn }: { signedIn: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "friends")
  const [lists, setLists] = useState<Lists | null>(null)
  const [q, setQ] = useState("")
  const [found, setFound] = useState<PublicProfile[] | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    liveCall<{ ok: boolean } & Lists>("friends:list", null).then((r) => r.ok && setLists({ friends: r.friends, incoming: r.incoming, outgoing: r.outgoing }))
  }, [])

  useEffect(() => {
    if (!signedIn) return
    load()
    const t = setInterval(load, 20_000)
    window.addEventListener("t64:friends-changed", load)
    return () => {
      clearInterval(t)
      window.removeEventListener("t64:friends-changed", load)
    }
  }, [signedIn, load])

  useEffect(() => {
    if (!signedIn || q.trim().length < 2) return
    const t = setTimeout(() => {
      liveCall<{ ok: boolean; profiles: PublicProfile[] }>("profile:search", q).then((r) => r.ok && setFound(r.profiles))
    }, 250)
    return () => clearTimeout(t)
  }, [q, signedIn])

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-[560px]">
        <PanelHeader title="Friends" />
        <div className="g-panel mt-5 p-6 text-center">
          <p className="text-[16px]">Sign in to add friends, see who&apos;s online and challenge them.</p>
          <Link href="/account?next=/play/friends" className="g-btn g-btn-primary mt-5">
            Sign in or create an account
          </Link>
        </div>
      </div>
    )
  }

  const respond = async (id: string, accept: boolean) => {
    await liveCall("friends:respond", { id, accept })
    load()
  }
  const add = async (p: PublicProfile) => {
    const r = await liveCall<{ ok: boolean; relation?: string }>("friends:request", p.player_id)
    if (r.ok) setSent((s) => new Set(s).add(p.player_id))
    load()
  }

  const ids = (l: Friend[] | undefined) => new Set((l ?? []).map((f) => f.player_id))
  const friendIds = ids(lists?.friends)
  const outIds = ids(lists?.outgoing)
  const inIds = ids(lists?.incoming)
  const requests = (lists?.incoming.length ?? 0) + (lists?.outgoing.length ?? 0)
  const onlineCount = lists?.friends.filter((f) => f.online).length ?? 0

  const tabs: [Tab, string][] = [
    ["friends", `Friends${lists ? ` (${lists.friends.length})` : ""}`],
    ["requests", `Requests${lists?.incoming.length ? ` (${lists.incoming.length})` : ""}`],
    ["find", "Find players"],
  ]

  return (
    <div className="mx-auto max-w-[860px]">
      <PanelHeader title="Friends" right={lists ? <span className="g-muted text-[13px]">{onlineCount} online</span> : null} />
      <div role="tablist" className="mt-4 flex gap-2 overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className="g-choice h-[40px] shrink-0 px-4 text-[14px] font-semibold">
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!lists && <p className="g-muted py-10 text-center">Loading…</p>}

        {lists && tab === "friends" &&
          (lists.friends.length ? (
            lists.friends.map((f) => (
              <Card key={f.player_id} p={f} sub={statusOf(f)}>
                {f.playing ? (
                  <button type="button" className="g-btn !min-h-[38px] text-[13px]" onClick={() => router.push(`/play/${f.playing}`)}>
                    Watch
                  </button>
                ) : (
                  <button type="button" disabled={!f.online} className="g-btn g-btn-primary !min-h-[38px] text-[13px]" onClick={() => openChallenge(f)}>
                    Challenge
                  </button>
                )}
                <button
                  type="button"
                  className="g-btn g-btn-ghost !min-h-[38px] !px-2.5 text-[13px]"
                  aria-label={`Remove ${f.display_name}`}
                  onClick={() => window.confirm(`Remove ${f.display_name} from your friends?`) && respond(f.player_id, false)}
                >
                  ✕
                </button>
              </Card>
            ))
          ) : (
            <div className="g-panel p-8 text-center">
              <p className="text-[16px]">No friends yet.</p>
              <p className="g-muted mt-1 text-[14px]">Find players by their username or name and send a request.</p>
              <button type="button" className="g-btn g-btn-primary mt-5" onClick={() => setTab("find")}>
                Find players
              </button>
            </div>
          ))}

        {lists && tab === "requests" && (
          <>
            {lists.incoming.map((f) => (
              <Card key={f.player_id} p={f} sub={<span className="text-[var(--g-gold)]">Wants to be friends</span>}>
                <button type="button" className="g-btn g-btn-primary !min-h-[38px] text-[13px]" onClick={() => respond(f.player_id, true)}>
                  Accept
                </button>
                <button type="button" className="g-btn !min-h-[38px] text-[13px]" onClick={() => respond(f.player_id, false)}>
                  Decline
                </button>
              </Card>
            ))}
            {lists.outgoing.map((f) => (
              <Card key={f.player_id} p={f} sub={<span className="g-muted">Request sent</span>}>
                <button type="button" className="g-btn !min-h-[38px] text-[13px]" onClick={() => respond(f.player_id, false)}>
                  Cancel
                </button>
              </Card>
            ))}
            {!requests && <p className="g-panel g-muted p-8 text-center">No friend requests.</p>}
          </>
        )}

        {lists && tab === "find" && (
          <>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by username or name"
              className="h-[48px] w-full rounded-xl border border-[var(--g-line)] bg-[var(--g-panel-2)] px-4 text-[15px] outline-none focus:border-[var(--g-gold)]"
            />
            {q.trim().length >= 2 &&
              found?.map((p) => {
                const isFriend = friendIds.has(p.player_id)
                const requested = outIds.has(p.player_id) || sent.has(p.player_id)
                const incoming = inIds.has(p.player_id)
                return (
                  <Card key={p.player_id} p={p} sub={statusOf(p)}>
                    {isFriend ? (
                      <span className="g-muted text-[13px] font-semibold">Friends ✓</span>
                    ) : requested ? (
                      <span className="g-muted text-[13px] font-semibold">Requested</span>
                    ) : (
                      <button type="button" className="g-btn g-btn-primary !min-h-[38px] text-[13px]" onClick={() => add(p)}>
                        {incoming ? "Accept request" : "Add friend"}
                      </button>
                    )}
                  </Card>
                )
              })}
            {q.trim().length >= 2 && found?.length === 0 && <p className="g-panel g-muted p-6 text-center">No players found.</p>}
          </>
        )}
      </div>
    </div>
  )
}
