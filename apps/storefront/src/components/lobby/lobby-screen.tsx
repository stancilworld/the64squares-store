"use client"

import Link from "next/link"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { openSignIn } from "@/components/account/sign-in-dialog"
import { GameView } from "@/components/play/game-view"
import { RichText } from "@/components/rich-text"
import { type ArenaState, ArenaTable, type ArenaYou } from "@/components/tourney/arena-table"
import { Bracket } from "@/components/tourney/bracket"
import { Countdown, useNow } from "@/components/tourney/countdown"
import { LiveBoards } from "@/components/tourney/live-boards"
import { Crosstable, SwissPairings, SwissStandings } from "@/components/tourney/swiss"
import { nowMs } from "@/lib/clock"
import { GAME_URL } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import { checkInToTournament } from "@/lib/tournament-actions"
import { myMatch } from "@/components/tourney/schedule-card"
import { eventTime, type LiveBoard, speedLabel, type Ticket, type Tournament, type TourneyView } from "@/lib/tournament-types"
import { LobbyChat } from "./lobby-chat"
import { type Channel, type LobbyJoin, type LobbyMe, type LobbyMsg, type LobbySettings, type Person, type Presence, ROLE_LABEL, type Role, SEND_ERROR } from "./lobby-types"
import { LobbyVoice, type VoiceState } from "./lobby-voice"

// The tournament's lobby: the one place for the whole event. An esports-style arena:
//   a broadcast bar (status, clock, voice) always on top;
//   arena mode: the caster desk (the moderator, or the Auto Moderator) in the spotlight,
//   the participants on the arena floor, the participants & moderators' chat on the left
//   and the viewers' chat on the right;
//   match mode: a player's own game (it opens by itself, with the Ready check) or any board
//   a viewer opens, with that game's commentary, the lobby's chats in a drawer.

export type RuleChapter = { handle: string; label: string; title: string; body: string }

type Props = {
  t: Tournament
  initialView: TourneyView | null
  pass: PlayPass | null
  ticket: (Ticket & { tournament: { id: string } }) | null
  chapters: RuleChapter[]
  initialGame: string | null
}

// Each format has its own stage: colour, piece and pattern, and what its table shows.
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

type Tab = "floor" | "live" | "table" | "rules" | "chat"
const NO_VOICE: VoiceState = { joined: false, speakers: [], hands: [], active: [], listeners: 0 }

function Face({ p, size = 40 }: { p: { name: string; avatar_url?: string | null }; size?: number }) {
  return p.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatar_url} alt="" width={size} height={size} className="lobby-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="lobby-avatar lobby-avatar-letter" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

// ------------------------------------------------------------------ caster desk

function CasterDesk({ moderators, voice, latest, status }: { moderators: Person[]; voice: VoiceState; latest: LobbyMsg | null; status: string }) {
  const onMic = (id: string) => voice.speakers.some((s) => s.id === id)
  return (
    <section className="desk" aria-label="Moderators">
      <div className="desk-row">
        {moderators.length ? (
          moderators.map((m) => (
            <div key={m.id} className={`desk-mod ${voice.active.includes(m.id) ? "is-speaking" : ""}`}>
              <span className="desk-ring">
                <Face p={m} size={72} />
              </span>
              <p className="desk-name">{m.name}</p>
              <p className="desk-role">
                <span className="lobby-badge lobby-badge-moderator">Moderator</span>
                {onMic(m.id) && <span className="desk-mic">on mic</span>}
              </p>
            </div>
          ))
        ) : (
          <div className="desk-mod desk-auto">
            <span className="desk-ring">
              <span className="desk-auto-face" aria-hidden="true" />
            </span>
            <p className="desk-name">Auto Moderator</p>
            <p className="desk-role">
              <span className="lobby-badge lobby-badge-moderator">Moderator</span>
            </p>
          </div>
        )}
      </div>
      <p className="desk-status">{status}</p>
      {latest && (
        <p className="desk-ticker" aria-live="polite">
          <span className="desk-ticker-from">{latest.author.name}:</span> {latest.text}
        </p>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ arena floor

type Seat = { id: string; name: string; rating: number | null; avatar_url: string | null; here: boolean; game: string | null; rank: number | null; score: string | null; out: boolean; available: boolean }
type Challenge = { from: { id: string; name: string; score: number; games: number }; until: number }
// A match offer from matchmaking: both players accept, then the game starts.
type Offer = { id: string; until: number; opponent: { id: string; name: string; score: number; games: number }; accepted: boolean; theyAccepted: boolean }

function ArenaFloor({
  seats,
  voice,
  meId,
  onOpen,
  colourLabel,
  challenge,
}: {
  seats: Seat[]
  voice: VoiceState
  meId: string | null
  onOpen: (id: string) => void
  colourLabel: string
  // Challenge arenas: I may challenge available players.
  challenge?: { can: boolean; pending: string | null; onChallenge: (id: string) => void }
}) {
  if (!seats.length) return <p className="lobby-empty">The participants appear here as they arrive in the lobby.</p>
  return (
    <ul className="floor" aria-label="Participants">
      {seats.map((s) => {
        const speaking = voice.active.includes(s.id)
        const hand = voice.hands.some((h) => h.id === s.id)
        const cls = ["seat", s.here ? "is-here" : "is-away", s.game ? "is-playing" : "", speaking ? "is-speaking" : "", s.id === meId ? "is-me" : "", s.out ? "is-out" : ""].join(" ")
        const body = (
          <>
            {s.rank != null && <span className="seat-rank">{s.rank}</span>}
            <span className="seat-face">
              <Face p={s} size={52} />
              {hand && (
                <span className="seat-hand" aria-label="Hand raised">
                  ✋
                </span>
              )}
            </span>
            <span className="seat-name">
              {s.name}
              {s.id === meId && " (you)"}
            </span>
            <span className="seat-meta">
              {s.rating ?? ""}
              {s.score != null && <b className="seat-score">{s.score}</b>}
            </span>
            <span className="seat-state">{s.out ? "Out" : s.game ? "Playing · watch" : s.available ? "Available" : s.here ? "In the lobby" : "Away"}</span>
          </>
        )
        const canChallenge = !!challenge?.can && s.available && s.id !== meId && !s.game
        return (
          <li key={s.id}>
            {s.game ? (
              <button type="button" className={cls} onClick={() => onOpen(s.game!)} aria-label={`${s.name}, playing: watch the game`}>
                {body}
              </button>
            ) : (
              <div className={cls} aria-label={`${s.name}, ${colourLabel}`}>
                {body}
                {canChallenge && (
                  <button type="button" className="seat-challenge" disabled={!!challenge?.pending} onClick={() => challenge?.onChallenge(s.id)}>
                    {challenge?.pending === s.id ? "Challenged…" : "Challenge"}
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------------ rules

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
              {t.start_mode === "scheduled" && t.format !== "arena" && <li>No check-in: register before the deadline, and be here at your match time. You get {t.join_minutes ?? 5} minutes to press Ready.</li>}
              <li>Stay in this lobby: when you&apos;re paired your board opens here. Press Ready; the clocks start when both players are ready. Not ready in time loses the game.</li>
              <li>Questions? Use &ldquo;Ask the arbiter&rdquo; in the participants&apos; chat; only moderators see it.</li>
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

// ------------------------------------------------------------------ the lobby

export function LobbyScreen({ t, initialView, pass, ticket: initialTicket, chapters, initialGame }: Props) {
  const f = FORMATS[t.format] ?? FORMATS.arena
  const token = pass?.token ?? null
  const meId = pass?.me.id ?? null
  const socket = useRef<Socket | null>(null)
  const [sock, setSock] = useState<Socket | null>(null)
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
  const [tab, setTab] = useState<Tab>("floor")
  const [chatArea, setChatArea] = useState<"participants" | "viewers">("participants")
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejoin, setRejoin] = useState(0)
  const [voice, setVoice] = useState<VoiceState>(NO_VOICE)
  // Challenge arenas: challenges to me, and the one I sent.
  const [incoming, setIncoming] = useState<Challenge[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  // The game on the stage (match mode), and the games already opened by themselves.
  const [gameId, setGameId] = useState<string | null>(initialGame)
  const opened = useRef(new Set<string>(initialGame ? [initialGame] : []))
  // Games I was paired into (mine), for the label above the board.
  const [mine, setMine] = useState<string[]>([])
  const now = useNow()
  const n = (now ?? nowMs()) + offset

  const open = useCallback((id: string | null) => {
    setGameId(id)
    setDrawer(false)
    if (id) opened.current.add(id)
    try {
      const u = new URL(window.location.href)
      if (id) u.searchParams.set("game", id)
      else u.searchParams.delete("game")
      window.history.replaceState(null, "", u)
    } catch {}
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("connect", () => {
      setSock(s)
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
    s.on("arena:challenged", (c: Challenge & { tournament_id: string }) => {
      if (c.tournament_id === t.id) setIncoming((list) => [...list.filter((x) => x.from.id !== c.from.id), { from: c.from, until: c.until }])
    })
    s.on("arena:challenge-answer", (d: { tournament_id: string; by: string; accepted: boolean }) => {
      if (d.tournament_id !== t.id) return
      setPending(null)
      if (!d.accepted) setError(`${d.by} declined your challenge.`)
    })
    s.on("arena:offer", (o: Omit<Offer, "accepted" | "theyAccepted"> & { tournament_id: string }) => {
      if (o.tournament_id === t.id) setOffer({ id: o.id, until: o.until, opponent: o.opponent, accepted: false, theyAccepted: false })
    })
    s.on("arena:offer-ready", (d: { tournament_id: string; id: string }) => {
      if (d.tournament_id === t.id) setOffer((o) => (o && o.id === d.id ? { ...o, theyAccepted: true } : o))
    })
    s.on("arena:offer-gone", (d: { tournament_id: string; id: string; reason: string; missed?: string[] }) => {
      if (d.tournament_id !== t.id) return
      setOffer((o) => (o && o.id === d.id ? null : o))
      if (d.reason === "declined") setError("Your opponent said no to that match. You'll get another offer soon, or challenge someone.")
      else if (d.reason === "timeout" && meId && d.missed?.includes(meId)) {
        setError("You didn't accept in time, so you're out of the arena for now. Press Join the arena to play again.")
        setArenaYou((y) => (y ? { ...y, joined: false, waiting: false } : y))
      } else if (d.reason === "timeout") setError("Your opponent didn't accept in time. You'll get another offer soon.")
    })
    // Paired: the board opens here, with the Ready check.
    const paired = (p: { game_id: string; tournament_id: string }) => {
      if (p.tournament_id !== t.id) return
      setMine((m) => (m.includes(p.game_id) ? m : [...m, p.game_id]))
      setPending(null)
      setIncoming([])
      setOffer(null)
      open(p.game_id)
    }
    s.on("tourney:paired", paired)
    s.on("arena:paired", paired)
    return () => {
      s.disconnect()
    }
  }, [t.id, t.format, token, meId, open])

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
  const myBoard = meId ? view?.live.find((b) => b.white?.id === meId || b.black?.id === meId) : undefined
  // Arena: my game is the one I was just paired into, while the arena says I'm playing.
  const arenaMe = meId ? arena?.standings.find((r) => r.player_id === meId) : undefined
  const myGame = myBoard?.game_id ?? (arenaMe?.status === "playing" ? (mine.at(-1) ?? arenaYou?.game_id ?? null) : null)

  // Arriving (or coming back) while my game is on: it opens by itself, once.
  useEffect(() => {
    if (!myGame || opened.current.has(myGame)) return
    const id = setTimeout(() => open(myGame), 0)
    return () => clearTimeout(id)
  }, [myGame, open])

  const roundText = useMemo(() => {
    if (!view?.state) return null
    if (t.format === "swiss" || t.format === "round_robin") return `Round ${view.state.round} of ${view.rounds ?? t.rounds ?? "?"}`
    if (t.format === "knockout" && view.bracket) return view.bracket.rounds[view.state.round - 1]?.name ?? null
    return null
  }, [view, t.format, t.rounds])

  // The arena floor: everyone in the tournament (or, before it starts, the participants here).
  const seats = useMemo<Seat[]>(() => {
    const here = new Map((presence?.players ?? []).map((p) => [p.id, p]))
    const playing = new Map<string, string>()
    for (const b of view?.live ?? []) {
      if (b.white?.id) playing.set(b.white.id, b.game_id)
      if (b.black?.id) playing.set(b.black.id, b.game_id)
    }
    const rows: Seat[] = []
    if (t.format === "arena" && arena?.standings.length) {
      for (const r of arena.standings)
        rows.push({ id: r.player_id, name: r.name, rating: null, avatar_url: here.get(r.player_id)?.avatar_url ?? null, here: here.has(r.player_id), game: playing.get(r.player_id) ?? null, rank: r.rank, score: String(r.score), out: false, available: r.status === "waiting" })
    } else if (view?.entrants.length) {
      const standing = new Map((view.standings ?? []).map((s) => [s.id, s]))
      for (const e of view.entrants) {
        const st = standing.get(e.id)
        rows.push({ id: e.id, name: e.name, rating: e.rating, avatar_url: here.get(e.id)?.avatar_url ?? null, here: here.has(e.id), game: playing.get(e.id) ?? null, rank: st?.rank ?? null, score: st ? String(st.points) : null, out: e.withdrawn, available: false })
      }
    }
    for (const p of presence?.players ?? []) if (!rows.some((r) => r.id === p.id)) rows.push({ id: p.id, name: p.name, rating: null, avatar_url: p.avatar_url, here: true, game: playing.get(p.id) ?? null, rank: null, score: null, out: false, available: false })
    const weight = (s: Seat) => (s.out ? 3 : s.game ? 0 : s.here ? 1 : 2)
    return rows.sort((a, b) => weight(a) - weight(b) || (a.rank ?? 9999) - (b.rank ?? 9999) || (b.rating ?? 0) - (a.rating ?? 0))
  }, [presence, view, arena, t.format])

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

  // Players always choose their opponents in an arena.
  const challengeMode = t.format === "arena"
  const answerOffer = (accept: boolean) => {
    if (!offer) return
    if (accept) setOffer({ ...offer, accepted: true })
    else setOffer(null)
    socket.current?.emit("arena:offer-answer", { tid: t.id, id: offer.id, accept }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok && accept) {
        setOffer(null)
        setError("That match offer has expired.")
      }
    })
  }
  const liveOffer = offer && offer.until > n - offset ? offer : null
  const sendChallenge = (to: string) =>
    socket.current?.emit("arena:challenge", { tid: t.id, to }, (res: { ok: boolean; until?: number; error?: string }) => {
      if (!res.ok) {
        const why: Record<string, string> = {
          "join-first": "Press Join the arena first.",
          busy: "They're not available right now.",
          "played-enough": "You've played each other twice already here. Challenge someone else.",
          "not-started": "The arena hasn't started yet.",
          over: "The arena is over.",
        }
        return setError(why[res.error ?? ""] ?? "That challenge didn't go through.")
      }
      setError(null)
      setPending(to)
      setTimeout(() => setPending((p) => (p === to ? null : p)), Math.max(0, (res.until ?? 0) - Date.now()) + 500)
    })
  const answer = (from: string, accept: boolean) => {
    setIncoming((list) => list.filter((c) => c.from.id !== from))
    socket.current?.emit("arena:answer", { tid: t.id, from, accept }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok && accept) setError(res.error === "expired" ? "That challenge has expired." : "They're not available any more.")
    })
  }
  const liveIncoming = incoming.filter((c) => c.until > n - offset)
  const myRow = meId ? arena?.standings.find((r) => r.player_id === meId) : undefined

  // ------------------------------------------------------------------ your seat (what to do now)

  const seat = (() => {
    if (role === "moderator") return <p className="lobby-seat-text">You&apos;re moderating. Chat tools are under the participants&apos; chat; voice tools under Voice in the bar above.</p>
    if (role === "spectator")
      return (
        <p className="lobby-seat-text">
          You&apos;re watching. Tap a player who&apos;s playing, or a live board, to watch the game with its commentary.{" "}
          {(!pass || pass.me.guest) && (
            <>
              <button type="button" className="underline" onClick={openSignIn}>
                Sign in
              </button>{" "}
              to chat.
            </>
          )}
        </p>
      )
    if (finished) return <p className="lobby-seat-text">The tournament is over. Thanks for playing!</p>
    if (myGame)
      return (
        <button type="button" className="lobby-seat-go lobby-pulse" onClick={() => open(myGame)}>
          Back to your board
        </button>
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
          <p className="lobby-seat-text">
            {`You're available. Tap Challenge on a player's card${arena?.pairing === "challenge" ? ", or wait to be challenged" : ". Don't pick anyone and we'll offer you a match to accept"}.${arena?.min_games && arena.min_games > 1 ? ` Games: ${myRow?.games ?? 0} of ${arena.min_games} needed to be ranked.` : ""}`}
          </p>
          <button type="button" className="g-btn" onClick={() => arenaCall("arena:pause")}>
            Take a break
          </button>
        </div>
      ) : (
        <button type="button" className="lobby-seat-go" onClick={() => arenaCall("arena:join")}>
          Join the arena
        </button>
      )
    const next = t.start_mode === "scheduled" ? myMatch(view, meId) : null
    if (next)
      return (
        <p className="lobby-seat-text">
          {next.opponent
            ? `Your next match: ${next.label} vs ${next.opponent}${next.at ? `, ${eventTime(new Date(next.at).toISOString())}` : ""}${next.colour ? ` (you play ${next.colour})` : ""}. Be here then: the board opens by itself and you have ${t.join_minutes ?? 5} minutes to press Ready.`
            : `${next.label}: you have a bye this round (a free point).`}
        </p>
      )
    if (running) return <p className="lobby-seat-text">You&apos;re in. Stay here: your next board opens here by itself when you&apos;re paired.</p>
    return <p className="lobby-seat-text">{ticket?.checked_in_at ? "Checked in. Your first board opens here at the start." : "You're registered. Stay here: your first board opens here at the start."}</p>
  })()

  const table = (() => {
    if (t.format === "arena") return arena ? <ArenaTable arena={arena} meId={meId} /> : <p className="lobby-empty">The leaderboard fills up once the arena starts.</p>
    if (!view?.state) return <p className="lobby-empty">The {f.table.toLowerCase()} appears when the first round is paired.</p>
    if (t.format === "knockout") return <Bracket view={view} meId={meId} />
    if (t.format === "round_robin") return <Crosstable view={view} meId={meId} />
    return (
      <div className="flex flex-col gap-6">
        <SwissStandings view={view} meId={meId} />
        <SwissPairings view={view} meId={meId} />
      </div>
    )
  })()

  const statusChip = (() => {
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

  const clock = (() => {
    if (!running && !finished && t.status !== "cancelled") return { label: checkinOpen ? "Starts in" : "Starts in", to: starts }
    if (running && t.format === "arena" && arena) return { label: "Ends in", to: arena.ends_at }
    if (running && view?.state?.next_round_at && view.state.round_done_at) return { label: "Next round in", to: view.state.next_round_at }
    return null
  })()

  const deskStatus = (() => {
    if (finished) return "The tournament is over. Final standings are in the table."
    if (running && view?.state?.round_done_at) return `${roundText ?? "This round"} is over. Next round coming up.`
    if (running) return `${roundText ? `${roundText} is on.` : "Games are on."} ${view?.live.length ? `${view.live.length} board${view.live.length === 1 ? "" : "s"} live.` : ""}`
    if (checkinOpen) return "Check-in is open. Participants: check in so you're paired."
    return "Welcome! The tournament starts soon."
  })()

  const latest = [...messages].reverse().find((m) => m.channel === "all") ?? null
  const closedNote = join && !join.window.open ? (n < join.window.opens_at ? `The lobby opens ${eventTime(new Date(join.window.opens_at).toISOString())}${t.check_in_minutes > 0 ? ", with check-in" : ""}.` : "The lobby has closed. You can still read the chat.") : null

  const chat = (area: "participants" | "viewers" | "announcements") =>
    join && settings ? (
      <LobbyChat area={area} role={role} me={meL} settings={settings} quick={join.quick} messages={messages} open={join.window.open} send={send} mod={mod} />
    ) : (
      <p className="lobby-empty">Connecting to the lobby…</p>
    )
  // Viewers see the moderators' announcements in place of the participants' chat.
  const leftArea = role === "spectator" ? "announcements" : "participants"
  const hub = (
    <div className="chat-hub">
      <div className="lobby-seg" role="radiogroup" aria-label="Chat">
        <button type="button" role="radio" aria-checked={chatArea === "participants"} onClick={() => setChatArea("participants")}>
          {role === "spectator" ? "Moderators" : "Participants"}
        </button>
        <button type="button" role="radio" aria-checked={chatArea === "viewers"} onClick={() => setChatArea("viewers")}>
          Viewers
        </button>
      </div>
      {chatArea === "participants" ? chat(leftArea) : chat("viewers")}
    </div>
  )

  const tabs: [Tab, string][] = [
    ["floor", "Arena"],
    ["live", `Live boards${view?.live.length ? ` (${view.live.length})` : ""}`],
    ["table", f.table],
    ["rules", "Rules & guide"],
    ["chat", "Chat"],
  ]

  // Playing my own game: the board gets the whole screen. Voice and chat are for the lobby,
  // so a player at the board neither hears the call nor sees the messages.
  const playing = !!gameId && gameId === myGame

  if (playing)
    return (
      <div className="lobby" data-format={t.format} data-mode="play" style={{ "--fc": f.colour, "--piece": `url(/pieces/classic/w${f.piece}.svg)` } as CSSProperties}>
        <div className="play-strip">
          <button type="button" className="g-btn !min-h-[34px] !px-3 !text-[13px]" onClick={() => open(null)}>
            ‹ Lobby
          </button>
          <span className="lobby-format">{f.name}</span>
          <span className="play-strip-title">{t.title}</span>
          {roundText && <span className="play-strip-meta">{roundText}</span>}
          {clock && (
            <span className="play-strip-clock">
              {clock.label} <Countdown to={clock.to} offset={offset} size="sm" />
            </span>
          )}
        </div>
        <GameView key={gameId} id={gameId} initialPass={pass} embedded={{ onExit: () => open(null), onOpen: (id) => open(id) }} />
      </div>
    )

  return (
    <div className="lobby" data-format={t.format} data-mode={gameId ? "match" : "arena"} style={{ "--fc": f.colour, "--piece": `url(/pieces/classic/w${f.piece}.svg)` } as CSSProperties}>
      {/* Broadcast bar: always on top, so voice and the clock carry on in match mode. */}
      <header className="bcast">
        <div className="bcast-art" aria-hidden="true" />
        <div className="bcast-main">
          <div className="bcast-title-row">
            <span className="lobby-format">{f.name}</span>
            {statusChip}
            <span className={`lobby-role lobby-role-${role}`}>You: {ROLE_LABEL[role]}</span>
          </div>
          <h1 className="bcast-title">{t.title}</h1>
          <p className="bcast-meta">
            {t.time_control} {speedLabel(t.time_control)}
            {seats.length ? ` · ${seats.length} participants` : ""}
            {presence ? ` · ${presence.spectators} watching` : ""}
            {" · "}
            <Link href={`/play/tournaments/${t.handle}?details=1`} className="underline underline-offset-2">
              Tournament details
            </Link>
          </p>
        </div>
        {clock && (
          <div className="bcast-clock">
            <span className="bcast-clock-label">{clock.label}</span>
            <Countdown to={clock.to} offset={offset} size="sm" />
          </div>
        )}
        <div className="bcast-voice">
          {join?.voice_site && settings && join.window.open && <LobbyVoice socket={sock} tid={t.id} role={role} meId={meId} settings={settings} players={presence?.players ?? []} onState={setVoice} />}
          {gameId && (
            <button type="button" className="lv-btn lv-btn-quiet" aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
              💬 Chat
            </button>
          )}
        </div>
      </header>

      {(error || closedNote) && <p className="lobby-note">{error ?? closedNote}</p>}

      {gameId ? (
        <div className="match">
          <div className="match-bar">
            <button type="button" className="g-btn !min-h-[38px] !px-3 !text-[14px]" onClick={() => open(null)}>
              ‹ Back to the arena
            </button>
            <span className="match-label">{myGame === gameId || mine.includes(gameId) ? "Your game" : "Watching"} · the commentary is in the side panel</span>
          </div>
          <GameView key={gameId} id={gameId} initialPass={pass} embedded={{ onExit: () => open(null), onOpen: (id) => open(id) }} />
        </div>
      ) : (
        <div className="arena-grid">
          <aside className="arena-left">{chat(leftArea)}</aside>
          <main className="arena-center">
            <CasterDesk moderators={presence?.moderators ?? []} voice={voice} latest={latest} status={deskStatus} />
            <div className="lobby-seat">{seat}</div>
            <div className="lobby-tabs" role="tablist" aria-label="Lobby">
              {tabs.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={k === "chat" ? "lobby-tab-chat" : undefined} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="lobby-panel">
              {tab === "floor" && (
                <ArenaFloor
                  seats={seats}
                  voice={voice}
                  meId={meId}
                  onOpen={open}
                  colourLabel={f.name}
                  challenge={challengeMode && running && role === "player" && arenaYou?.joined && !myGame ? { can: true, pending, onChallenge: sendChallenge } : undefined}
                />
              )}
              {tab === "live" &&
                (view?.live.length ? (
                  <LiveBoards boards={view.live} offset={offset} onOpen={open} />
                ) : (
                  <p className="lobby-empty">{running ? "No games on right now. The next round's boards appear here." : "The boards appear here when the games start."}</p>
                ))}
              {tab === "table" && table}
              {tab === "rules" && <Rules t={t} chapters={chapters} how={f.how} />}
              {tab === "chat" && hub}
            </div>
          </main>
          <aside className="arena-right">{chat("viewers")}</aside>
        </div>
      )}

      {(liveIncoming.length > 0 || liveOffer) && (
        <div className="challenge-box" role="alertdialog" aria-label="A match for you">
          {liveOffer && (
            <div className="challenge-card challenge-offer">
              <p className="challenge-title">♟ Match found: {liveOffer.opponent.name}</p>
              <p className="challenge-meta">
                {liveOffer.opponent.score} pts · {liveOffer.opponent.games} games · {Math.max(0, Math.ceil((liveOffer.until - (n - offset)) / 1000))} s to accept
                {liveOffer.theyAccepted ? " · they've accepted" : ""}
              </p>
              {liveOffer.accepted ? (
                <p className="mt-2 text-[14px] font-bold">Accepted. Waiting for {liveOffer.opponent.name}…</p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button type="button" className="ready-go !min-h-[42px] !px-5 !text-[15px]" onClick={() => answerOffer(true)}>
                    Accept
                  </button>
                  <button type="button" className="g-btn !min-h-[42px]" onClick={() => answerOffer(false)}>
                    Not this one
                  </button>
                </div>
              )}
            </div>
          )}
          {liveIncoming.slice(0, 3).map((c) => (
            <div key={c.from.id} className="challenge-card">
              <p className="challenge-title">♟ {c.from.name} challenges you</p>
              <p className="challenge-meta">
                {c.from.score} pts · {c.from.games} games · {Math.max(0, Math.ceil((c.until - (n - offset)) / 1000))} s to answer
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="ready-go !min-h-[42px] !px-5 !text-[15px]" onClick={() => answer(c.from.id, true)}>
                  Accept
                </button>
                <button type="button" className="g-btn !min-h-[42px]" onClick={() => answer(c.from.id, false)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {gameId && drawer && (
        <div className="chat-drawer" role="dialog" aria-label="Lobby chat">
          <div className="flex items-center justify-between">
            <p className="font-extrabold">Lobby chat</p>
            <button type="button" className="lv-x" aria-label="Close the chat" onClick={() => setDrawer(false)}>
              ×
            </button>
          </div>
          {hub}
        </div>
      )}
    </div>
  )
}
