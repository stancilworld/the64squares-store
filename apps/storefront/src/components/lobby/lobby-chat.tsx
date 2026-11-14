"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { openSignIn } from "@/components/account/sign-in-dialog"
import { useNow } from "@/components/tourney/countdown"
import { nowMs } from "@/lib/clock"
import { type Channel, type LobbyMe, type LobbyMsg, type LobbySettings, type PlayersChat, ROLE_LABEL, type Role, type SpectatorChat, writeMode } from "./lobby-types"

type Props = {
  role: Role
  me: LobbyMe | null
  settings: LobbySettings
  quick: string[]
  messages: LobbyMsg[]
  open: boolean
  send: (channel: Channel, kind: "text" | "quick", text: string, thread?: string) => Promise<string | null>
  mod: (action: string, body?: Record<string, unknown>) => Promise<string | null>
  // Which chat area this is: the participants and moderators' table, the viewers' stand,
  // or (for viewers, in place of the participants' chat) the moderators' announcements.
  area: "participants" | "viewers" | "announcements"
}

const time = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })

function RoleBadge({ role }: { role: Role }) {
  if (role === "spectator") return null
  return (
    <span className={`lobby-badge lobby-badge-${role}`}>
      {role === "moderator" && (
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M8 1 2.5 3v4.2c0 3.3 2.3 6.3 5.5 7.3 3.2-1 5.5-4 5.5-7.3V3L8 1Z" fill="currentColor" />
        </svg>
      )}
      {ROLE_LABEL[role]}
    </span>
  )
}

function Message({ m, canModerate, mod }: { m: LobbyMsg; canModerate: boolean; mod: Props["mod"] }) {
  const [menu, setMenu] = useState(false)
  if (m.kind === "system") return <p className="lobby-system">{m.text}</p>
  if (m.kind === "announce")
    return (
      <div className="lobby-announce">
        <p className="lobby-announce-from">
          <RoleBadge role="moderator" /> {m.author.name} · {time(m.at)}
        </p>
        <p className="mt-1 whitespace-pre-line">{m.text}</p>
      </div>
    )
  const target = canModerate && m.author.role !== "moderator"
  return (
    <div className={`lobby-msg lobby-msg-${m.author.role}`}>
      <p className="min-w-0 flex-1 break-words">
        <span className="lobby-msg-name">{m.author.name}</span>
        <RoleBadge role={m.author.role} />
        <span className={m.kind === "quick" ? "lobby-msg-quick" : "lobby-msg-text"}>{m.text}</span>
      </p>
      <span className="lobby-msg-time">{time(m.at)}</span>
      {canModerate && (
        <span className="relative">
          <button type="button" className="lobby-msg-more" aria-label={`Moderate message from ${m.author.name}`} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            ⋯
          </button>
          {menu && (
            <span className="lobby-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button role="menuitem" type="button" onClick={() => (setMenu(false), void mod("delete", { id: m.id }))}>
                Delete message
              </button>
              {target && (
                <>
                  <button role="menuitem" type="button" onClick={() => (setMenu(false), void mod("mute", { player_id: m.author.id, minutes: 10 }))}>
                    Mute for 10 minutes
                  </button>
                  <button role="menuitem" type="button" onClick={() => (setMenu(false), void mod("mute", { player_id: m.author.id, minutes: 60 }))}>
                    Mute for an hour
                  </button>
                  <button role="menuitem" type="button" className="text-[#ff8a80]" onClick={() => (setMenu(false), void mod("remove", { player_id: m.author.id }))}>
                    Remove from chat
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function Composer({ mode, why, quick, onSend, placeholder }: { mode: "text" | "quick" | "none"; why: string | null; quick: string[]; onSend: (kind: "text" | "quick", text: string) => Promise<string | null>; placeholder: string }) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const go = async (kind: "text" | "quick", value: string) => {
    if (!value.trim()) return
    const err = await onSend(kind, value)
    setError(err)
    if (!err && kind === "text") setText("")
  }
  if (mode === "none")
    return (
      <div className="lobby-compose">
        {why && <p className="lobby-why">{why}</p>}
        {why === "Sign in to chat." && (
          <button type="button" className="g-btn g-btn-primary mt-2 w-full" onClick={openSignIn}>
            Sign in
          </button>
        )}
      </div>
    )
  return (
    <div className="lobby-compose">
      <div className="lobby-quick" role="group" aria-label="Quick messages">
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => void go("quick", q)}>
            {q}
          </button>
        ))}
      </div>
      {mode === "text" && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void go("text", text)
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={placeholder} aria-label={placeholder} className="lobby-input" />
          <button type="submit" className="g-btn g-btn-primary !min-h-[42px] !px-4" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
      {(error || why) && <p className="lobby-why">{error ?? why}</p>}
    </div>
  )
}

function ModTools({ settings, mod }: { settings: LobbySettings; mod: Props["mod"] }) {
  const [text, setText] = useState("")
  const [pin, setPin] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const seg = <T extends string>(label: string, value: T, options: [T, string][], key: "players_chat" | "spectator_chat") => (
    <div>
      <p className="lobby-tools-label">{label}</p>
      <div className="lobby-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => void mod("settings", { [key]: v })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <details className="lobby-tools">
      <summary>Moderator tools</summary>
      <div className="flex flex-col gap-3 pt-3">
        {seg<PlayersChat>("Players' chat", settings.players_chat, [["open", "Open"], ["quick", "Quick only"], ["off", "Off"]], "players_chat")}
        {seg<SpectatorChat>("Spectators' chat", settings.spectator_chat, [["open", "Open"], ["slow", "Slow"], ["off", "Off"]], "spectator_chat")}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const err = await mod("announce", { text, pin })
            setNote(err ?? "Announced.")
            if (!err) setText("")
          }}
        >
          <p className="lobby-tools-label">Announcement to everyone</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={2} className="lobby-input w-full resize-none !py-2" placeholder="Round 2 starts in 5 minutes…" aria-label="Announcement" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Pin it at the top
            </label>
            <button type="submit" className="g-btn g-btn-primary !min-h-[38px] !px-4 !text-[14px]" disabled={!text.trim()}>
              Announce
            </button>
          </div>
          {note && <p className="lobby-why">{note}</p>}
        </form>
      </div>
    </details>
  )
}

export function LobbyChat(props: Props) {
  const { role, me, settings, quick, messages, open, send, mod, area } = props
  const now = useNow() ?? 0
  const tabs: { key: Channel; label: string }[] =
    area === "viewers"
      ? [{ key: "spectators", label: "Viewers" }]
      : area === "announcements"
        ? [{ key: "all", label: "From the moderators" }]
        : [
            { key: "players", label: "Participants" },
            { key: "arbiter", label: role === "moderator" ? "Questions" : "Ask the arbiter" },
          ]
  const [tab, setTab] = useState<Channel>(tabs[0].key)
  const [thread, setThread] = useState<string | null>(null)
  const [seen, setSeen] = useState<Record<string, number>>({})
  const feed = useRef<HTMLDivElement>(null)

  // Moderators: the players who asked something, latest first.
  const threads = useMemo(() => {
    const m = new Map<string, { id: string; name: string; at: number; waiting: boolean }>()
    for (const x of messages) {
      if (x.channel !== "arbiter" || !x.thread) continue
      const cur = m.get(x.thread)
      const name = x.author.role === "moderator" ? (cur?.name ?? "Player") : x.author.name
      m.set(x.thread, { id: x.thread, name, at: x.at, waiting: x.author.role !== "moderator" })
    }
    return [...m.values()].sort((a, b) => b.at - a.at)
  }, [messages])

  // Announcements show in the participants' and the announcements area, not in the viewers'
  // chat (viewers see them in their announcements area).
  const shown = messages.filter(
    (m) => (m.channel === "all" && tab !== "arbiter" && area !== "viewers") || (m.channel === tab && (tab !== "arbiter" || role !== "moderator" || m.thread === thread))
  )
  const count = (c: Channel) => messages.filter((m) => m.channel === c && m.at > (seen[c] ?? 0)).length

  const last = shown.at(-1)?.id
  useEffect(() => {
    const el = feed.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last, tab, thread])

  const pick = (c: Channel) => {
    setSeen((s) => ({ ...s, [tab]: nowMs(), [c]: nowMs() }))
    setTab(c)
  }

  const w = area === "announcements" ? { mode: "none" as const, why: null } : open ? writeMode(role, me, settings, tab, now) : { mode: "none" as const, why: "The chat opens with the lobby." }
  const replyThread = role === "moderator" && tab === "arbiter" ? thread : undefined
  const composer = role === "moderator" && tab === "arbiter" && !thread ? null : (
    <Composer
      mode={w.mode}
      why={w.why}
      quick={tab === "arbiter" || role === "moderator" ? [] : quick}
      placeholder={tab === "arbiter" ? (role === "moderator" ? "Reply to this player" : "Your question for the moderators") : "Say something nice"}
      onSend={(kind, text) => send(tab, kind, text, replyThread ?? undefined)}
    />
  )

  return (
    <section className={`lobby-chat lobby-chat-${area}`} aria-label={area === "viewers" ? "Viewers' chat" : area === "announcements" ? "Moderators' announcements" : "Participants and moderators' chat"}>
      <h2 className="lobby-chat-title">
        {area === "viewers" ? "Viewers' chat" : area === "announcements" ? "From the moderators" : "Participants & moderators"}
      </h2>
      {tabs.length > 1 && (
        <div className="lobby-chat-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)}>
              {t.label}
              {tab !== t.key && count(t.key) > 0 && <span className="lobby-unread">{Math.min(count(t.key), 99)}</span>}
            </button>
          ))}
        </div>
      )}
      {settings.pinned && (
        <div className="lobby-pinned">
          <span aria-hidden="true">📌</span>
          <p className="min-w-0 flex-1">{settings.pinned}</p>
          {role === "moderator" && (
            <button type="button" className="text-[12px] font-semibold underline" onClick={() => void mod("unpin")}>
              Unpin
            </button>
          )}
        </div>
      )}
      {tab === "arbiter" && role === "moderator" && (
        <div className="lobby-threads">
          {threads.length === 0 ? (
            <p className="lobby-why">No questions yet. Players&apos; questions to the arbiter appear here; only moderators see them.</p>
          ) : (
            threads.map((t) => (
              <button key={t.id} type="button" aria-pressed={thread === t.id} onClick={() => setThread(t.id)}>
                {t.waiting && <span className="lobby-dot" aria-label="Waiting for an answer" />}
                {t.name}
              </button>
            ))
          )}
        </div>
      )}
      <div ref={feed} className="lobby-feed" aria-live="polite">
        {tab === "arbiter" && role === "player" && <p className="lobby-system">Questions about rules, pairings or a problem in your game? Only the moderators see what you write here.</p>}
        {tab === "players" && <p className="lobby-system">Participants and moderators only. Viewers don&apos;t see this chat.</p>}
        {area === "announcements" && <p className="lobby-system">Announcements and updates from the moderators appear here.</p>}
        {area === "viewers" && <p className="lobby-system">Everyone watching chats here. Participants can join in too.</p>}
        {shown.length === 0 && tab !== "arbiter" && area !== "announcements" && <p className="lobby-system">No messages yet.</p>}
        {shown.map((m) => (
          <Message key={m.id} m={m} canModerate={role === "moderator"} mod={mod} />
        ))}
      </div>
      {area !== "announcements" && composer}
      {role === "moderator" && area === "participants" && <ModTools settings={settings} mod={mod} />}
      <p className="lobby-footnote">
        Be kind. No phone numbers, links or addresses. Messages are kept for the moderators. <Link href="/play/rules?ch=fair-play">Fair play</Link>
      </p>
    </section>
  )
}
