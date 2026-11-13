"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { openSignIn } from "@/components/account/sign-in-dialog"
import { RichText } from "@/components/rich-text"
import { type ArenaState, ArenaTable, type ArenaYou } from "@/components/tourney/arena-table"
import { Bracket } from "@/components/tourney/bracket"
import { Countdown, useNow } from "@/components/tourney/countdown"
import { LiveBoards } from "@/components/tourney/live-boards"
import { Crosstable, SwissPairings, SwissStandings } from "@/components/tourney/swiss"
import { nowMs } from "@/lib/clock"
import { GAME_URL } from "@/lib/game-types"
import { checkInToTournament } from "@/lib/tournament-actions"
import { eventTime, type LiveBoard, speedLabel, type Ticket, type Tournament, type TourneyView } from "@/lib/tournament-types"
import { LobbyChat } from "./lobby-chat"
import { type Channel, type LobbyJoin, type LobbyMe, type LobbyMsg, type LobbySettings, type Person, type Presence, ROLE_LABEL, type Role, SEND_ERROR } from "./lobby-types"

export type RuleChapter = { handle: string; label: string; title: string; body: string }

type Props = {
  t: Tournament
  initialView: TourneyView | null
  token: string | null
  me: { id: string; name: string; guest: boolean } | null
  ticket: (Ticket & { tournament: { id: string } }) | null
  chapters: RuleChapter[]
}

// Each format has its own stage: colour, piece and pattern, and what the main table shows.
const FORMATS: Record<string, { colour: string; piece: string; name: string; table: string; how: string }> = {
  arena: {
    colour: "#ffb300",
    piece: "Q",
    name: "Arena",
    table: "Leaderboard",
    how: "Play as many games as you can before the clock runs out. You're paired again as soon as a game ends. A win scores 2, a draw 1, and two wins in a row put you on fire for double points.",
  },
  swiss: {
    colour: "#35c6d4",
    piece: "N",
    name: "Swiss",
    table: "Standings",
    how: "Everyone plays every round; nobody is knocked out. Each round you meet a player on the same score, never the same opponent twice. Most points wins; ties are split by Buchholz, then Sonneborn-Berger.",
  },
  knockout: {
    colour: "#ff5d5d",
    piece: "K",
    name: "Knockout",
    table: "Bracket",
    how: "Players are seeded by rating into a bracket. Win your match to go through; lose and you're out. A drawn match goes to a sudden-death game where a draw is enough for Black.",
  },
  round_robin: {
    colour: "#9b8cff",
    piece: "R",
    name: "Round robin",
    table: "Crosstable",
    how: "Everyone plays everyone else. A win scores 1 and a draw ½. Most points wins; ties are split by Sonneborn-Berger, then the result between the tied players.",
  },
}

type Tab = "live" | "table" | "rules" | "chat"

function Avatar({ p, size = 30 }: { p: Person; size?: number }) {
  return p.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatar_url} alt="" width={size} height={size} className="lobby-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="lobby-avatar lobby-avatar-letter" style={{ width: size, height: size }} aria-hidden="true">
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function WhoIsHere({ presence, entrants }: { presence: Presence | null; entrants: number }) {
  if (!presence) return null
  return (
    <section className="lobby-here" aria-label="Who's here">
      <div className="lobby-here-row">
        <h3>Moderators</h3>
        {presence.moderators.length === 0 ? (
          <p className="lobby-why">A moderator joins before the start.</p>
        ) : (
          <ul>
            {presence.moderators.map((p) => (
              <li key={p.id} className="lobby-here-mod">
                <Avatar p={p} size={28} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lobby-here-row">
        <h3>
          Players here <span className="lobby-here-count">{presence.players.length}{entrants ? ` of ${entrants}` : ""}</span>
        </h3>
        <ul className="lobby-here-faces">
          {presence.players.slice(0, 40).map((p) => (
            <li key={p.id} title={p.name}>
              <Avatar p={p} size={30} />
              <span className="sr-only">{p.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="lobby-here-watch">
        <span className="lobby-dot lobby-dot-live" aria-hidden="true" /> {presence.spectators} watching
      </p>
    </section>
  )
}

function Rules({ t, chapters, how }: { t: Tournament; chapters: RuleChapter[]; how: string }) {
  const [ch, setCh] = useState("event")
  const current = chapters.find((c) => c.handle === ch)
  return (
    <div className="lobby-rules">
      <div className="lobby-rules-nav" role="tablist" aria-label="Rule book">
        <button type="button" role="tab" aria-selected={ch === "event"} onClick={() => setCh("event")}>
          This tournament
        </button>
        {chapters.map((c) => (
          <button key={c.handle} type="button" role="tab" aria-selected={ch === c.handle} onClick={() => setCh(c.handle)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="rule-text mt-4">
        {current ? (
          <>
            <h2 className="!mt-0 !text-[22px] !text-white">{current.title}</h2>
            <RichText text={current.body} className="mt-3" />
          </>
        ) : (
          <>
            <h2 className="!mt-0 !text-[22px] !text-white">How {t.title} works</h2>
            <p className="mt-3">{how}</p>
            <ul className="mt-4 list-disc space-y-1 pl-6">
              <li>
                Time control <strong>{t.time_control}</strong> ({speedLabel(t.time_control)})
                {t.rounds ? `, ${t.rounds} rounds` : ""}.
              </li>
              {t.check_in_minutes > 0 && <li>Check in during the {t.check_in_minutes} minutes before the start. Players who don&apos;t check in aren&apos;t paired.</li>}
              <li>Stay in the lobby: your game opens by itself when you&apos;re paired. Not making a first move loses the game.</li>
              <li>Questions? Use &ldquo;Ask the arbiter&rdquo; in the chat; only moderators see it.</li>
            </ul>
            {t.rules && (
              <>
                <h2>Extra rules for this event</h2>
                <RichText text={t.rules} className="mt-3" />
              </>
            )}
            {t.prizes && (
              <>
                <h2>Prizes</h2>
                <RichText text={t.prizes} className="mt-3" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function LobbyScreen({ t, initialView, token, me: pass, ticket: initialTicket, chapters }: Props) {
  const router = useRouter()
  const f = FORMATS[t.format] ?? FORMATS.arena
  const socket = useRef<Socket | null>(null)
  const [view, setView] = useState<TourneyView | null>(initialView)
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [arenaYou, setArenaYou] = useState<ArenaYou>(null)
  const [offset, setOffset] = useState(0)
  const [join, setJoin] = useState<LobbyJoin | null>(null)
  const [messages, setMessages] = useState<LobbyMsg[]>([])
  const [settings, setSettings] = useState<LobbySettings | null>(null)
  const [presence, setPresence] = useState<Presence | null>(null)
  const [meL, setMeL] = useState<LobbyMe | null>(null)
  const [ticket, setTicket] = useState(initialTicket)
  const [tab, setTab] = useState<Tab>("live")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejoin, setRejoin] = useState(0)
  const now = useNow()
  const n = (now ?? nowMs()) + offset

  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("connect", () => {
      s.emit("lobby:join", t.id, (res: LobbyJoin | { ok: false; error: string }) => {
        if (!res.ok) return setError("The lobby couldn't open. Please reload the page.")
        setJoin(res)
        setMessages(res.messages)
        setSettings(res.settings)
        setPresence(res.presence)
        setMeL(res.me)
        setOffset(res.server_now - nowMs())
      })
      s.emit("tourney:watch", t.id, (res: { ok: boolean; view?: TourneyView }) => {
        if (res.ok && res.view) setView(res.view)
      })
      if (t.format === "arena")
        s.emit("arena:watch", t.id, (res: { ok: boolean; arena?: ArenaState; you?: ArenaYou }) => {
          if (res.ok && res.arena) {
            setArena(res.arena)
            setArenaYou(res.you ?? null)
          }
        })
    })
    s.on("lobby:msg", (m: LobbyMsg & { tid: string }) => {
      if (m.tid === t.id) setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-500)))
    })
    s.on("lobby:deleted", (d: { tid: string; id: string }) => {
      if (d.tid === t.id) setMessages((list) => list.filter((x) => x.id !== d.id))
    })
    s.on("lobby:settings", (d: { tid: string; settings: LobbySettings }) => {
      if (d.tid === t.id) setSettings(d.settings)
    })
    s.on("lobby:presence", (d: Presence & { tid: string }) => {
      if (d.tid === t.id) setPresence(d)
    })
    s.on("lobby:you", (d: { tid: string; muted_until: number | null; removed: boolean }) => {
      if (d.tid === t.id) setMeL((m) => (m ? { ...m, muted_until: d.muted_until, removed: d.removed } : m))
    })
    s.on("lobby:refresh", (d: { tid: string }) => {
      if (d.tid === t.id || d.tid === "*") setRejoin((x) => x + 1)
    })
    s.on("tourney:state", (v: TourneyView) => setView(v))
    s.on("tourney:board", (b: Partial<LiveBoard> & { game_id: string; status: string }) =>
      setView((v) => {
        if (!v) return v
        const live = b.status === "active" ? v.live.map((x) => (x.game_id === b.game_id ? { ...x, ...b } : x)) : v.live.filter((x) => x.game_id !== b.game_id)
        return { ...v, live }
      })
    )
    s.on("arena:state", (a: ArenaState) => setArena(a))
    // Paired: the game opens by itself.
    const go = (p: { game_id: string; tournament_id: string }) => {
      if (p.tournament_id === t.id) router.push(`/play/${p.game_id}`)
    }
    s.on("tourney:paired", go)
    s.on("arena:paired", go)
    return () => {
      s.disconnect()
    }
  }, [t.id, t.format, token, router])

  // A moderator was added or removed: join again to get the new role.
  useEffect(() => {
    if (!rejoin) return
    socket.current?.emit("lobby:join", t.id, (res: LobbyJoin | { ok: false }) => {
      if (!res.ok) return
      setJoin(res)
      setMessages(res.messages)
      setSettings(res.settings)
      setMeL(res.me)
    })
  }, [rejoin, t.id])

  const send = useCallback(
    (channel: Channel, kind: "text" | "quick", text: string, thread?: string) =>
      new Promise<string | null>((resolve) => {
        const s = socket.current
        if (!s) return resolve("Not connected.")
        s.timeout(8000).emit("lobby:send", { tid: t.id, channel, kind, text, thread }, (err: Error | null, res: { ok: boolean; error?: string }) => {
          if (err) return resolve("Not sent. Check your connection.")
          resolve(res.ok ? null : (SEND_ERROR[res.error ?? ""] ?? "Not sent."))
        })
      }),
    [t.id]
  )
  const mod = useCallback(
    (action: string, body: Record<string, unknown> = {}) =>
      new Promise<string | null>((resolve) => {
        const s = socket.current
        if (!s) return resolve("Not connected.")
        s.timeout(8000).emit("lobby:mod", { tid: t.id, action, ...body }, (err: Error | null, res: { ok: boolean; error?: string }) => {
          if (err) return resolve("That didn't work. Check your connection.")
          resolve(res.ok ? null : (SEND_ERROR[res.error ?? ""] ?? "That didn't work."))
        })
      }),
    [t.id]
  )

  const role: Role = join?.role ?? (ticket ? "player" : "spectator")
  const starts = new Date(t.starts_at).getTime()
  const finished = t.status === "completed" || view?.state?.phase === "finished" || arena?.phase === "over"
  const running = !finished && (view?.state?.phase === "running" || arena?.phase === "live" || (t.format === "arena" && n >= starts))
  const checkinOpen = !running && !finished && t.check_in_minutes > 0 && n >= starts - t.check_in_minutes * 60_000 && n < starts
  const myBoard = pass ? view?.live.find((b) => b.white?.id === pass.id || b.black?.id === pass.id) : undefined
  const myGame = myBoard?.game_id ?? arenaYou?.game_id ?? null

  const roundText = useMemo(() => {
    if (!view?.state) return null
    if (t.format === "swiss" || t.format === "round_robin") return `Round ${view.state.round} of ${view.rounds ?? t.rounds ?? "?"}`
    if (t.format === "knockout" && view.bracket) return view.bracket.rounds[view.state.round - 1]?.name ?? null
    return null
  }, [view, t.format, t.rounds])

  const checkIn = async () => {
    setBusy(true)
    const res = await checkInToTournament(t.handle)
    setBusy(false)
    if (res.ok) setTicket({ ...res.ticket, tournament: { id: t.id } } as Props["ticket"])
    else setError(res.error)
  }
  const arenaCall = (event: "arena:join" | "arena:pause") =>
    socket.current?.emit(event, t.id, (res: { ok: boolean; you?: ArenaYou; error?: string }) => {
      if (res.ok) setArenaYou(res.you ?? null)
      else setError(res.error === "not-registered" ? "You're not registered for this tournament." : "That didn't work. Please try again.")
    })

  // ------------------------------------------------------------------ your seat

  const seat = (() => {
    if (role === "moderator") return <p className="lobby-seat-text">You&apos;re moderating this lobby. Your tools are under the chat.</p>
    if (role === "spectator")
      return (
        <p className="lobby-seat-text">
          You&apos;re watching.{" "}
          {!pass || pass.guest ? (
            <button type="button" className="underline" onClick={openSignIn}>
              Sign in
            </button>
          ) : (
            <Link href="/play/tournaments" className="underline">
              Find a tournament to play
            </Link>
          )}
          {!pass || pass.guest ? " to chat with other spectators." : "."}
        </p>
      )
    if (finished) return <p className="lobby-seat-text">The tournament is over. Thanks for playing!</p>
    if (myGame)
      return (
        <Link href={`/play/${myGame}`} className="lobby-seat-go">
          Go to your board
        </Link>
      )
    if (checkinOpen && ticket && !ticket.checked_in_at)
      return (
        <button type="button" className="lobby-seat-go lobby-pulse" disabled={busy} onClick={checkIn}>
          {busy ? "Checking in…" : "Check in now"}
        </button>
      )
    if (t.format === "arena" && running)
      return arenaYou?.joined ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="lobby-seat-text">Finding your next opponent… the board opens by itself.</p>
          <button type="button" className="g-btn" onClick={() => arenaCall("arena:pause")}>
            Take a break
          </button>
        </div>
      ) : (
        <button type="button" className="lobby-seat-go" onClick={() => arenaCall("arena:join")}>
          Join the arena
        </button>
      )
    if (running) return <p className="lobby-seat-text">You&apos;re in. Stay here: your next game opens by itself when you&apos;re paired.</p>
    return <p className="lobby-seat-text">{ticket?.checked_in_at ? "Checked in. Your first game opens by itself at the start." : "You're registered. Stay here: your first game opens by itself at the start."}</p>
  })()

  // ------------------------------------------------------------------ stage

  const table = (() => {
    if (t.format === "arena") return arena ? <ArenaTable arena={arena} meId={pass?.id ?? null} /> : <p className="lobby-empty">The leaderboard fills up once the arena starts.</p>
    if (!view?.state) return <p className="lobby-empty">The {f.table.toLowerCase()} appears when the first round is paired.</p>
    if (t.format === "knockout") return <Bracket view={view} meId={pass?.id ?? null} />
    if (t.format === "round_robin") return <Crosstable view={view} meId={pass?.id ?? null} />
    return (
      <div className="flex flex-col gap-6">
        <SwissStandings view={view} meId={pass?.id ?? null} />
        <SwissPairings view={view} meId={pass?.id ?? null} />
      </div>
    )
  })()

  const tabs: [Tab, string][] = [
    ["live", `Live boards${view?.live.length ? ` (${view.live.length})` : ""}`],
    ["table", f.table],
    ["rules", "Rules & guide"],
    ["chat", "Chat"],
  ]

  const statusLine = (() => {
    if (t.status === "cancelled") return <span className="lobby-chip">Cancelled</span>
    if (finished) return <span className="lobby-chip">Finished</span>
    if (running)
      return (
        <span className="lobby-chip lobby-chip-live">
          <span className="lobby-dot lobby-dot-white" aria-hidden="true" /> Live{roundText ? ` · ${roundText}` : ""}
        </span>
      )
    return <span className="lobby-chip">{checkinOpen ? "Check-in open" : "Starting soon"}</span>
  })()

  const closedNote = join && !join.window.open ? (n < join.window.opens_at ? `The lobby opens ${eventTime(new Date(join.window.opens_at).toISOString())}, with check-in.` : "The lobby has closed. You can still read the chat.") : null

  return (
    <div className="lobby" data-format={t.format} style={{ "--fc": f.colour, "--piece": `url(/pieces/classic/w${f.piece}.svg)` } as CSSProperties}>
      <header className="lobby-stage">
        {t.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image_url} alt="" className="lobby-stage-img" />
        )}
        <div className="lobby-stage-pattern" aria-hidden="true" />
        <div className="lobby-stage-piece" aria-hidden="true" />
        <div className="lobby-stage-body">
          <Link href={`/play/tournaments/${t.handle}`} className="lobby-back">
            ‹ Tournament page
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="lobby-format">{f.name}</span>
            {statusLine}
            <span className={`lobby-role lobby-role-${role}`}>You: {ROLE_LABEL[role]}</span>
          </div>
          <h1 className="lobby-title">{t.title}</h1>
          <p className="lobby-meta">
            {t.time_control} {speedLabel(t.time_control)}
            {view?.entrants.length ? ` · ${view.entrants.length} players` : ""}
            {presence ? ` · ${presence.spectators} watching` : ""}
          </p>
          <div className="lobby-clock">
            {!running && !finished && t.status !== "cancelled" && (
              <>
                <span className="lobby-clock-label">{checkinOpen ? "Check-in open · starts in" : "Starts in"}</span>
                <Countdown to={starts} offset={offset} />
              </>
            )}
            {running && t.format === "arena" && arena && (
              <>
                <span className="lobby-clock-label">Ends in</span>
                <Countdown to={arena.ends_at} offset={offset} />
              </>
            )}
            {running && view?.state?.next_round_at && view.state.round_done_at && (
              <>
                <span className="lobby-clock-label">Next round in</span>
                <Countdown to={view.state.next_round_at} offset={offset} />
              </>
            )}
          </div>
        </div>
      </header>

      <div className="lobby-seat">{seat}</div>
      {(error || closedNote) && <p className="lobby-note">{error ?? closedNote}</p>}

      <div className="lobby-grid">
        <div className="lobby-main">
          <div className="lobby-tabs" role="tablist" aria-label="Lobby">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={k === "chat" ? "lobby-tab-chat" : undefined} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className={`lobby-panel ${tab === "chat" ? "lobby-panel-chatmode" : ""}`}>
            {tab === "live" && (view?.live.length ? <LiveBoards boards={view.live} offset={offset} /> : <p className="lobby-empty">{running ? "No games on right now. The next round's boards appear here." : "The boards appear here when the games start."}</p>)}
            {tab === "table" && table}
            {tab === "rules" && <Rules t={t} chapters={chapters} how={f.how} />}
          </div>
        </div>
        <aside className={`lobby-side ${tab === "chat" ? "lobby-side-open" : ""}`}>
          {join && settings ? (
            <LobbyChat role={role} me={meL} settings={settings} quick={join.quick} messages={messages} open={join.window.open} send={send} mod={mod} />
          ) : (
            <p className="lobby-empty">Connecting to the lobby…</p>
          )}
          <WhoIsHere presence={presence} entrants={view?.entrants.length ?? 0} />
        </aside>
      </div>
    </div>
  )
}
