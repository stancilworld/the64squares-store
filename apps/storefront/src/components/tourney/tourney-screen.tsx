"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { openSignIn } from "@/components/account/sign-in-dialog"
import { GAME_URL } from "@/lib/game-types"
import { cancelMyTicket, checkInToTournament, getPlayerProfile, type PassWallet, type PlayerProfile, recordTournamentVisit, registerForTournament } from "@/lib/tournament-actions"
import { eventDay, eventTime, FORMAT_COLOUR, type LiveBoard, type PublicPlayer, speedLabel, type Ticket, type Tournament, type TourneyView } from "@/lib/tournament-types"
import { type ArenaState, ArenaTable, type ArenaYou } from "./arena-table"
import { Bracket } from "./bracket"
import { Countdown, useNow } from "./countdown"
import { LiveBoards } from "./live-boards"
import { PrizeClaim } from "./prize-claim"
import { ProfileDialog } from "./profile-dialog"
import { trafficSource, visitorId } from "./source"
import { TourneyStats } from "./stats"
import { Crosstable, SwissPairings, SwissStandings } from "./swiss"
import { nowMs } from "@/lib/clock"

type Props = {
  t: Tournament
  initialView: TourneyView | null
  players: PublicPlayer[]
  token: string | null
  meId: string | null
  ticket: Ticket | null
  ticketQr: string | null
  passes: PassWallet | null
  profileComplete: boolean
  avatarBase: string
}

type Phase = "upcoming" | "checkin" | "live" | "between" | "over" | "cancelled"

const FORMAT_HOW: Record<string, string> = {
  arena: "Play as many games as you can before the clock runs out. You're paired again as soon as a game ends. A win scores 2, a draw 1, and two wins in a row put you on fire for double points.",
  swiss: "Everyone plays every round; nobody is knocked out. Each round you meet a player on the same score, never the same opponent twice. Most points wins; ties are split by Buchholz, then Sonneborn-Berger.",
  knockout: "Players are seeded by rating into a bracket. Win your match to go through; lose and you're out. A drawn match goes to a sudden-death game where a draw is enough for Black.",
}

const PLACE_STYLE: Record<string, string> = { "1": "from-[#f5c542] to-[#b8860b]", "2": "from-[#e3e6ea] to-[#8f959c]", "3": "from-[#e7a46b] to-[#8a4f22]" }

const ordinal = (n: number) => {
  const v = n % 100
  return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] ?? ["th", "st", "nd", "rd"][v] ?? "th"}`
}
const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`)

const ics = (t: Tournament) => `/api/tournaments/${t.handle}/calendar`

export function TourneyScreen(props: Props) {
  const { t, token, meId, avatarBase } = props
  const router = useRouter()
  const socket = useRef<Socket | null>(null)
  const [view, setView] = useState<TourneyView | null>(props.initialView)
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [arenaYou, setArenaYou] = useState<ArenaYou>(null)
  const [offset, setOffset] = useState(0)
  const [ticket, setTicket] = useState<Ticket | null>(props.ticket)
  const [passes, setPasses] = useState(props.passes?.balance ?? null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<string>("overview")
  const [paired, setPaired] = useState<string | null>(null)
  const now = useNow()

  const colour = t.accent || FORMAT_COLOUR[t.format] || "#ffb300"
  const starts = new Date(t.starts_at).getTime()

  // Live: the engine's view (pairings, bracket, boards, stats) and, for arenas, the arena feed.
  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("connect", () => {
      s.emit("tourney:watch", t.id, (res: { ok: boolean; view?: TourneyView }) => {
        if (res.ok && res.view) {
          setView(res.view)
          setOffset(res.view.server_now - nowMs())
        }
      })
      if (t.format === "arena")
        s.emit("arena:watch", t.id, (res: { ok: boolean; arena?: ArenaState; you?: ArenaYou }) => {
          if (res.ok && res.arena) {
            setArena(res.arena)
            setArenaYou(res.you ?? null)
            setOffset(res.arena.server_now - nowMs())
          }
        })
    })
    s.on("tourney:state", (v: TourneyView) => setView(v))
    s.on("tourney:board", (b: Partial<LiveBoard> & { game_id: string; status: string }) =>
      setView((v) => {
        if (!v) return v
        const live = b.status === "active" ? v.live.map((x) => (x.game_id === b.game_id ? { ...x, ...b } : x)) : v.live.filter((x) => x.game_id !== b.game_id)
        return { ...v, live }
      })
    )
    s.on("arena:state", (a: ArenaState) => {
      setArena(a)
      if (meId) {
        const me = a.standings.find((r) => r.player_id === meId)
        setArenaYou((y) => (y ? { ...y, waiting: me?.status === "waiting", joined: me?.status === "waiting" || me?.status === "playing" } : y))
      }
    })
    const go = (p: { game_id: string; tournament_id: string }) => {
      if (p.tournament_id !== t.id) return
      setPaired(p.game_id)
      router.push(`/play/${p.game_id}`)
    }
    s.on("tourney:paired", go)
    if (t.format === "arena") s.on("arena:paired", go)
    return () => {
      s.disconnect()
    }
  }, [t.id, t.format, token, meId, router])

  // One visit per visitor, with where they came from (the organisers' funnel report).
  useEffect(() => {
    const id = visitorId()
    if (id) void recordTournamentVisit(t.handle, id, trafficSource())
  }, [t.handle])

  const phase: Phase = useMemo(() => {
    if (t.status === "cancelled" || view?.state?.phase === "cancelled_low") return "cancelled"
    if (t.status === "completed" || view?.state?.phase === "finished" || arena?.phase === "over") return "over"
    const n = (now ?? nowMs()) + offset
    if (t.format === "arena") {
      if (arena?.phase === "live") return "live"
      if (n < starts) return ticket?.check_in && n >= new Date(ticket.check_in.opens).getTime() ? "checkin" : "upcoming"
      return arena ? "over" : "live"
    }
    if (view?.state?.phase === "running") return view.state.round_done_at ? "between" : "live"
    if (n < starts) {
      const opens = starts - (t.check_in_minutes ?? 0) * 60_000
      return t.check_in_minutes > 0 && n >= opens ? "checkin" : "upcoming"
    }
    return "live"
  }, [t, view, arena, now, offset, starts, ticket])

  const registered = ticket?.status === "confirmed"
  const myLive = meId ? view?.live.find((b) => b.white?.id === meId || b.black?.id === meId) : undefined
  const myGame = myLive?.game_id ?? arenaYou?.game_id ?? null

  const register = useCallback(async () => {
    setBusy(true)
    setError(null)
    const res = await registerForTournament(t.handle, { source: trafficSource() })
    setBusy(false)
    if (res.ok) {
      setTicket(res.ticket)
      if (res.ticket.pass_used && passes != null) setPasses(passes - (t.pass_cost || 1))
      router.refresh()
    } else if (res.signIn) openSignIn()
    else if (res.profile) {
      setProfile(await getPlayerProfile())
      setProfileOpen(true)
    } else setError(res.error)
  }, [t.handle, t.pass_cost, passes, router])

  const startEntry = async () => {
    if (!meId) return openSignIn()
    if (!props.profileComplete && !profile?.complete) {
      setProfile(await getPlayerProfile())
      setProfileOpen(true)
      return
    }
    void register()
  }

  const checkIn = async () => {
    setBusy(true)
    setError(null)
    const res = await checkInToTournament(t.handle)
    setBusy(false)
    if (res.ok) setTicket(res.ticket)
    else setError(res.error)
  }

  const cancel = async () => {
    if (!ticket || !window.confirm(t.entry === "pass" ? "Give up your place? Your Tournament Pass comes back to your wallet." : "Give up your place?")) return
    setBusy(true)
    const res = await cancelMyTicket(ticket.ticket_code)
    setBusy(false)
    if (res.ok) {
      setTicket(null)
      if (ticket.pass_used && passes != null) setPasses(passes + (t.pass_cost || 1))
      router.refresh()
    } else setError(res.error ?? "Couldn't cancel.")
  }

  const arenaCall = (event: "arena:join" | "arena:pause") =>
    socket.current?.emit(event, t.id, (res: { ok: boolean; you?: ArenaYou; error?: string }) => {
      if (res.ok) setArenaYou(res.you ?? null)
      else setError(res.error === "fair-play-ban" ? "Your account is closed for tournaments after a fair-play review." : res.error === "not-registered" ? "You're not registered for this tournament." : "That didn't work. Please try again.")
    })

  // ---------------------------------------------------------------- hero

  const n = (now ?? nowMs()) + offset
  const status = (() => {
    if (phase === "cancelled") return <p className="text-[18px] font-bold text-[#ff8a80]">Cancelled{t.cancel_reason ? `: ${t.cancel_reason}` : view?.state?.note ? `: ${view.state.note}` : ""}</p>
    if (phase === "over") {
      const champ = view?.champion ? view.entrants.find((e) => e.id === view.champion)?.name : view?.standings?.[0]?.name ?? arena?.standings[0]?.name
      return (
        <p className="flex flex-wrap items-center gap-3 text-[18px] font-bold">
          <span className="rounded bg-white/15 px-2 py-1 text-[13px]">FINISHED</span>
          {champ && <span>🏆 {champ}</span>}
          {!t.results_final_at && <span className="text-[13px] font-medium text-white/60">Results are provisional until the fair-play review.</span>}
        </p>
      )
    }
    if (phase === "live" || phase === "between") {
      const roundText = (t.format === "swiss" || t.format === "round_robin") && view?.state ? `Round ${view.state.round} of ${view.rounds ?? t.rounds ?? "?"}` : t.format === "knockout" && view?.bracket && view.state ? view.bracket.rounds[view.state.round - 1]?.name : null
      return (
        <div className="flex flex-wrap items-end gap-5">
          <span className="inline-flex items-center gap-2 rounded-md bg-[#ff3b3b] px-3 py-1.5 text-[15px] font-extrabold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" /> LIVE{roundText ? ` · ${roundText}` : ""}
          </span>
          {(t.format === "arena" ? (arena?.paused ?? t.paused) : (view?.paused ?? t.paused)) && (
            <span className="rounded-md bg-white/15 px-3 py-1.5 text-[14px] font-bold">Paused by the arbiter: no new games start for now</span>
          )}
          {phase === "between" && view?.state?.next_round_at && (
            <span>
              <span className="mb-1 block text-[13px] font-semibold text-white/70">Next round in</span>
              <Countdown to={view.state.next_round_at} offset={offset} />
            </span>
          )}
          {t.format === "arena" && arena && (
            <span>
              <span className="mb-1 block text-[13px] font-semibold text-white/70">Ends in</span>
              <Countdown to={arena.ends_at} offset={offset} />
            </span>
          )}
        </div>
      )
    }
    const opens = starts - (t.check_in_minutes ?? 0) * 60_000
    return (
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-white/70">{phase === "checkin" ? "Check-in is open · starts in" : "Starts in"}</span>
        <Countdown to={starts} offset={offset} />
        {t.check_in_minutes > 0 && phase === "upcoming" && n < opens && <span className="mt-2 block text-[13px] text-white/60">Check-in opens {eventTime(new Date(opens).toISOString())}</span>}
      </div>
    )
  })()

  // ---------------------------------------------------------------- entry panel

  const panel = (() => {
    const tick = (label: string) => <p className="mt-3 flex items-center gap-2 text-[14px] text-[var(--g-good)]">✓ {label}</p>
    if (phase === "cancelled") return <p className="text-[15px]">This tournament was cancelled.{ticket?.pass_used ? " Your Tournament Pass has been returned." : ""}</p>
    if (phase === "over" && !registered) {
      return (
        <>
          <p className="text-[18px] font-extrabold">This tournament has finished</p>
          <p className="mt-1 text-[14px] text-[var(--g-muted)]">See the results and replay every game below.</p>
          <Link href="/play/tournaments" className="g-btn g-btn-primary mt-4 w-full">
            Find the next tournament
          </Link>
        </>
      )
    }
    if (!meId) {
      return (
        <>
          <p className="text-[18px] font-extrabold">{t.entry === "pass" ? "Free entry with a Tournament Pass" : "Free entry"}</p>
          <p className="mt-1 text-[14px] text-[var(--g-muted)]">{t.entry === "pass" ? "Create a free account: you get your first pass straight away." : "Sign in to register."}</p>
          <button type="button" onClick={openSignIn} className="g-btn g-btn-primary mt-4 h-[50px] w-full text-[16px]">
            Sign in to register
          </button>
        </>
      )
    }
    if (registered && ticket) {
      const live = phase === "live" || phase === "between"
      const myRow = view?.standings?.find((r) => r.id === meId)
      const out =
        t.format === "knockout" && view?.bracket
          ? view.bracket.rounds.some((r) => r.matches.some((m) => m.winner && m.winner !== meId && (m.a?.id === meId || m.b?.id === meId)))
          : !!myRow?.withdrawn
      return (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[var(--g-muted)]">Your Player ID</p>
              <p className="text-[26px] font-extrabold tracking-wider">{ticket.ticket_code}</p>
            </div>
            {props.ticketQr && <span className="w-[76px] shrink-0 rounded-md bg-white p-1.5 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={`QR code for ${ticket.ticket_code}`} dangerouslySetInnerHTML={{ __html: props.ticketQr }} />}
          </div>
          {phase === "upcoming" && (
            <>
              {tick("You're registered")}
              <p className="mt-2 text-[14px] text-[var(--g-muted)]">
                {t.check_in_minutes > 0 ? `Check in on this page in the ${t.check_in_minutes} minutes before the start. Players who don't check in aren't paired.` : "Come back when it starts: the Join button appears here."}
              </p>
              <a href={ics(t)} className="g-btn mt-4 w-full">
                Add to calendar
              </a>
            </>
          )}
          {phase === "checkin" &&
            (ticket.checked_in_at ? (
              <>
                {tick("Checked in")}
                <p className="mt-2 text-[14px] text-[var(--g-muted)]">Stay on this page. Your first game opens by itself when the tournament starts.</p>
              </>
            ) : t.check_in_minutes > 0 ? (
              <button type="button" disabled={busy} onClick={checkIn} className="mt-4 h-[54px] w-full animate-pulse rounded-lg bg-[var(--g-accent)] text-[18px] font-extrabold text-black motion-reduce:animate-none">
                {busy ? "Checking in…" : "Check in now"}
              </button>
            ) : (
              tick("You're registered")
            ))}
          {live &&
            (myGame ? (
              <Link href={`/play/${myGame}`} className="mt-4 flex h-[54px] w-full items-center justify-center rounded-lg bg-[#ff3b3b] text-[18px] font-extrabold text-white">
                Go to your board
              </Link>
            ) : t.format === "arena" ? (
              arenaYou?.joined ? (
                <>
                  <p className="mt-3 text-[15px]">Finding your next opponent… the board opens by itself.</p>
                  <button type="button" className="g-btn mt-3 w-full" onClick={() => arenaCall("arena:pause")}>
                    Take a break
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => arenaCall("arena:join")} className="mt-4 h-[54px] w-full rounded-lg bg-[var(--g-accent)] text-[18px] font-extrabold text-black">
                  {arenaYou?.paused ? "Join again" : "Join the arena"}
                </button>
              )
            ) : out ? (
              <p className="mt-3 text-[15px]">You&apos;re out of the running this time. Thanks for playing: watch the rest live below.</p>
            ) : t.check_in_minutes > 0 && !ticket.checked_in_at ? (
              <p className="mt-3 text-[15px]">You didn&apos;t check in, so you aren&apos;t playing in this one.</p>
            ) : (
              <p className="mt-3 text-[15px]">{phase === "between" ? "Next round coming up. Stay on this page." : "Waiting for your next game. Stay on this page."}</p>
            ))}
          {phase === "over" && (
            <div className="mt-3 text-[15px]">
              {ticket.final_rank ? (
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[22px] font-black ${PLACE_STYLE[String(ticket.final_rank)] ? `${PLACE_STYLE[String(ticket.final_rank)]} text-black` : "from-white/15 to-white/5 text-white"}`}
                  >
                    {ticket.final_rank}
                  </span>
                  <p className="leading-snug">
                    You finished <strong>{ordinal(ticket.final_rank)}</strong>
                    {ticket.score != null ? ` with ${fmtScore(ticket.score)} ${t.format === "knockout" ? (ticket.score === 1 ? "round won" : "rounds won") : "points"}` : ""}.
                    {!t.results_final_at && <span className="block text-[12px] text-[var(--g-muted)]">Provisional until the fair-play review.</span>}
                  </p>
                </div>
              ) : ticket.checked_in_at || t.check_in_minutes === 0 ? (
                <p>Thanks for playing! The results are being worked out.</p>
              ) : (
                <p>You didn&apos;t check in for this one.</p>
              )}
              <PrizeClaim ticket={ticket} />
              {ticket.certificate_no && (
                <Link href={`/certificates/${ticket.certificate_no}`} className="g-btn g-btn-primary mt-3 w-full">
                  Your certificate
                </Link>
              )}
              {ticket.coupon_code && (
                <p className="mt-3 rounded-lg border border-dashed border-white/25 px-3 py-2 text-[13px]">
                  A thank-you for playing: <strong className="tracking-wider">{ticket.coupon_code}</strong> off in the shop.
                </p>
              )}
            </div>
          )}
          {ticket.can_cancel && phase !== "over" && (
            <button type="button" onClick={cancel} disabled={busy} className="mt-3 w-full text-center text-[13px] text-[var(--g-muted)] underline underline-offset-2 hover:text-white">
              Can&apos;t make it? Give up your place{t.entry === "pass" ? " (pass returned)" : ""}
            </button>
          )}
        </>
      )
    }
    if (!t.registration_open || phase === "over") {
      return <p className="text-[15px]">{phase === "over" ? "This tournament has finished." : (t.registration_note ?? "Registration is closed.")}</p>
    }
    const cost = Math.max(1, t.pass_cost || 1)
    const short = t.entry === "pass" && passes != null && passes < cost
    return (
      <>
        <p className="text-[18px] font-extrabold">{t.entry === "pass" ? `Enter with ${cost === 1 ? "1 Tournament Pass" : `${cost} Tournament Passes`}` : "Free entry"}</p>
        {t.entry === "pass" && (
          <p className="mt-1 text-[14px] text-[var(--g-muted)]">
            You have <strong className="text-white">{passes ?? 0}</strong> {passes === 1 ? "pass" : "passes"}. If you can&apos;t make it, give up your place before the start and it comes back.
          </p>
        )}
        <button type="button" disabled={busy || short} onClick={startEntry} className="mt-4 h-[54px] w-full rounded-lg bg-[var(--g-accent)] text-[18px] font-extrabold text-black disabled:opacity-40">
          {busy ? "Registering…" : t.entry === "pass" ? "Use a pass and register" : "Register free"}
        </button>
        {short && (
          <p className="mt-3 text-[14px]">
            Earn a pass by playing rated games or solving puzzles every day.{" "}
            <Link href="/play/my-tournaments" className="text-[var(--g-accent)] underline underline-offset-2">
              How to earn passes
            </Link>
          </p>
        )}
        {t.places_left != null && <p className="mt-3 text-[13px] text-[var(--g-muted)]">{t.places_left} of {t.capacity} places left</p>}
      </>
    )
  })()

  // ---------------------------------------------------------------- tabs

  const isKo = t.format === "knockout"
  const isRR = t.format === "round_robin"
  // Round robin is run like Swiss rounds, on a fixed schedule.
  const isSwiss = t.format === "swiss" || isRR
  const tabs = [
    { id: "overview", label: "Overview" },
    ...(isKo ? [{ id: "bracket", label: "Bracket" }] : []),
    ...(isSwiss ? [{ id: "standings", label: "Standings" }, ...(isRR ? [{ id: "crosstable", label: "Crosstable" }] : []), { id: "pairings", label: "Pairings" }] : []),
    ...(t.format === "arena" ? [{ id: "standings", label: "Leaderboard" }] : []),
    { id: "live", label: `Live${view?.live.length ? ` (${view.live.length})` : ""}` },
    { id: "players", label: `Players (${props.players.length || view?.entrants.length || 0})` },
    { id: "games", label: `Games${view?.games?.length ? ` (${view.games.length})` : ""}` },
    { id: "stats", label: "Stats" },
  ]
  // Opens on the most useful tab once the event is under way.
  const firstLive = useRef(false)
  useEffect(() => {
    if (firstLive.current || !(phase === "live" || phase === "between" || phase === "over")) return
    firstLive.current = true
    setTab(isKo ? "bracket" : isSwiss ? (phase === "over" ? "standings" : "pairings") : "standings")
  }, [phase, isKo, isSwiss])

  const prizes = t.prize_list ?? []
  const stream = t.stream_url ? /(?:v=|youtu\.be\/|live\/)([\w-]{11})/.exec(t.stream_url)?.[1] : null

  return (
    <div className="pb-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--g-line)]">
        {t.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="absolute inset-0" style={{ background: `repeating-conic-gradient(#262626 0 25%, #1c1c1c 0 50%) 0 0/72px 72px` }} />
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/75 to-black/30" />
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2" style={{ background: colour }} />
        <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <div className="flex flex-wrap gap-2 text-[12px] font-extrabold">
              <span className="rounded px-2 py-1 text-black" style={{ background: colour }}>
                {t.format_label.toUpperCase()}
              </span>
              <span className="rounded bg-white/15 px-2 py-1 text-white">
                {speedLabel(t.time_control)} {t.time_control}
              </span>
              {t.entry === "pass" && <span className="rounded bg-white/15 px-2 py-1 text-white">FREE WITH A PASS</span>}
              {(t.age_min != null || t.age_max != null) && <span className="rounded bg-white/15 px-2 py-1 text-white">{t.age_max != null ? `UNDER ${t.age_max + 1}` : `${t.age_min}+`}</span>}
              {(t.rating_min != null || t.rating_max != null) && <span className="rounded bg-white/15 px-2 py-1 text-white">{t.rating_max != null ? `RATED UP TO ${t.rating_max}` : `RATED ${t.rating_min}+`}</span>}
            </div>
            <h1 className="mt-4 max-w-[760px] text-[34px] font-extrabold leading-[1.02] tracking-tight sm:text-[54px]">{t.title}</h1>
            {t.tagline && <p className="mt-3 max-w-[620px] text-[17px] text-white/80">{t.tagline}</p>}
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[15px] font-semibold text-white/85">
              <span>
                {eventDay(t.starts_at)}, {eventTime(t.starts_at)}
              </span>
              <span>
                {t.registered}
                {t.capacity ? ` / ${t.capacity}` : ""} players
              </span>
              {t.format === "swiss" && <span>{t.rounds ?? "Auto"} rounds</span>}
              {isRR && <span>{t.rounds === 2 ? "Everyone plays everyone twice" : "Everyone plays everyone"}</span>}
              {isKo && <span>{t.knockout_games === 1 ? "Single-game matches" : `Best of ${t.knockout_games}`}</span>}
            </p>
            <div className="mt-6">{status}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1f1f1f]/95 p-5 shadow-2xl backdrop-blur">
            {panel}
            {error && (
              <p role="alert" className="mt-3 text-[14px] text-[var(--g-bad)]">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      {paired && (
        <p role="status" className="mt-4 rounded-lg bg-[#ff3b3b] px-4 py-3 text-center font-bold text-white">
          Your game is ready.{" "}
          <Link href={`/play/${paired}`} className="underline">
            Go to the board
          </Link>
        </p>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-20 -mx-1 mt-6 overflow-x-auto bg-[var(--g-bg)]/95 px-1 py-2 backdrop-blur [scrollbar-width:none]" role="tablist" aria-label="Tournament">
        <div className="flex gap-1">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`h-10 shrink-0 rounded-lg px-4 text-[14px] font-bold transition ${tab === x.id ? "bg-white text-black" : "text-[var(--g-muted)] hover:bg-white/5 hover:text-white"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-6">
              {stream && (
                <div className="aspect-video overflow-hidden rounded-xl border border-[var(--g-line)]">
                  <iframe src={`https://www.youtube-nocookie.com/embed/${stream}`} title="Live commentary" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />
                </div>
              )}
              {prizes.length > 0 && (
                <section aria-labelledby="prizes-h">
                  <h2 id="prizes-h" className="text-[20px] font-extrabold">
                    Prizes
                  </h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {prizes.map((p) => (
                      <div key={p.place} className="relative overflow-hidden rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)]">
                        <div className={`flex items-center justify-between bg-gradient-to-r px-4 py-2 text-black ${PLACE_STYLE[p.place] ?? "from-[#3a3a3a] to-[#2a2a2a] text-white"}`}>
                          <span className="text-[13px] font-extrabold">{/^\d+$/.test(p.place) ? `${p.place}${p.place === "1" ? "st" : p.place === "2" ? "nd" : p.place === "3" ? "rd" : "th"} place` : p.place}</span>
                          <span aria-hidden="true">{p.place === "1" ? "🏆" : p.place === "2" ? "🥈" : p.place === "3" ? "🥉" : "🎁"}</span>
                        </div>
                        {p.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
                        )}
                        <div className="p-4">
                          <p className="text-[16px] font-bold">{p.title}</p>
                          {p.detail && <p className="mt-1 text-[13px] text-[var(--g-muted)]">{p.detail}</p>}
                          {p.product_handle && (
                            <Link href={`/products/${p.product_handle}`} className="mt-2 inline-block text-[13px] font-semibold text-[var(--g-accent)] hover:underline">
                              See it in the shop
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!!t.category_prizes?.length && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {t.category_prizes.map((c) => (
                        <li key={c.category} className="rounded-full bg-[var(--g-panel-2)] px-3 py-1.5 text-[13px]">
                          <strong>{c.category}</strong>: {c.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[12px] text-[var(--g-muted)]">Every player who finishes gets a certificate. Prizes are confirmed after the fair-play review, within 48 hours.</p>
                </section>
              )}
              {!prizes.length && t.prizes && (
                <section>
                  <h2 className="text-[20px] font-extrabold">Prizes</h2>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{t.prizes}</p>
                </section>
              )}
              {(t.description || t.summary) && (
                <section>
                  <h2 className="text-[20px] font-extrabold">About</h2>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-white/85">{t.description || t.summary}</p>
                </section>
              )}
              {t.rules && (
                <section>
                  <h2 className="text-[20px] font-extrabold">Rules</h2>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-white/85">{t.rules}</p>
                </section>
              )}
            </div>
            <aside className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5">
                <p className="text-[16px] font-extrabold" style={{ color: colour }}>
                  How {t.format_label} works
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/80">{FORMAT_HOW[t.format] ?? ""}</p>
              </div>
              <div className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5">
                <p className="text-[16px] font-extrabold">Schedule</p>
                <ol className="mt-3 space-y-3 border-l border-[var(--g-line)] pl-4 text-[14px]">
                  <li>
                    <span className="block font-semibold">Registration</span>
                    <span className="text-[var(--g-muted)]">Open until {t.registration_closes_at ? `${eventDay(t.registration_closes_at)}, ${eventTime(t.registration_closes_at)}` : "the start"}</span>
                  </li>
                  {t.check_in_minutes > 0 && (
                    <li>
                      <span className="block font-semibold">Check-in</span>
                      <span className="text-[var(--g-muted)]">
                        {eventTime(new Date(starts - t.check_in_minutes * 60_000).toISOString())} to {eventTime(t.starts_at)}
                      </span>
                    </li>
                  )}
                  <li>
                    <span className="block font-semibold">First game</span>
                    <span className="text-[var(--g-muted)]">{eventTime(t.starts_at)}</span>
                  </li>
                  <li>
                    <span className="block font-semibold">Results</span>
                    <span className="text-[var(--g-muted)]">Provisional at the end; final after the fair-play review (within 48 hours)</span>
                  </li>
                </ol>
              </div>
              <div className="rounded-xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5 text-[14px] leading-relaxed text-white/80">
                <p className="text-[16px] font-extrabold text-white">Fair play</p>
                <p className="mt-2">Every game is checked for computer help. Real players only, never the computer. Leaving a game loses it.</p>
              </div>
            </aside>
          </div>
        )}

        {tab === "bracket" && view && <Bracket view={view} meId={meId} />}
        {tab === "bracket" && !view?.bracket?.rounds.length && <p className="g-muted py-8 text-center">The bracket is drawn when the tournament starts, seeded by rating.</p>}
        {tab === "standings" && isSwiss && view && <SwissStandings view={view} meId={meId} roundRobin={isRR} />}
        {tab === "crosstable" && view && <Crosstable view={view} meId={meId} />}
        {tab === "standings" && t.format === "arena" && (arena ? <ArenaTable arena={arena} meId={meId} /> : <p className="g-muted py-8 text-center">Loading the leaderboard…</p>)}
        {tab === "pairings" && view && <SwissPairings view={view} meId={meId} />}
        {tab === "live" && <LiveBoards boards={view?.live ?? []} offset={offset} />}
        {tab === "players" && (
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {(props.players.length ? props.players : (view?.entrants ?? []).map((e) => ({ id: e.id, name: e.name, username: null, avatar: null, rating: e.rating, state: null, checked_in: true }))).map((p, i) => (
              <li key={p.id} className={`flex items-center gap-3 rounded-xl border bg-[var(--g-panel)] p-3 ${p.id === meId ? "border-[var(--g-accent)]/60" : "border-[var(--g-line)]"}`}>
                <span className="w-6 text-right text-[12px] font-bold tabular-nums text-[var(--g-muted)]">{i + 1}</span>
                {p.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${avatarBase}/${p.avatar}`} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--g-panel-3)] font-bold">{p.name.charAt(0).toUpperCase()}</span>
                )}
                <span className="min-w-0 flex-1">
                  {p.username ? (
                    <Link href={`/play/player/${p.username}`} className="block truncate font-semibold hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="block truncate font-semibold">{p.name}</span>
                  )}
                  <span className="block truncate text-[12px] text-[var(--g-muted)]">
                    {p.rating ?? "Unrated"}
                    {p.state ? ` · ${p.state}` : ""}
                  </span>
                </span>
                {t.check_in_minutes > 0 && p.checked_in && <span className="text-[12px] font-bold text-[var(--g-good)]" title="Checked in">✓</span>}
              </li>
            ))}
          </ul>
        )}
        {tab === "players" && !props.players.length && !view?.entrants.length && <p className="g-muted py-8 text-center">Be the first to register.</p>}
        {tab === "games" &&
          (view?.games?.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {view.games.map((g) => (
                <li key={g.id}>
                  <Link href={`/play/analysis/${g.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-[var(--g-line)] bg-[var(--g-panel)] px-3 py-2.5 hover:brightness-125">
                    <span className="truncate font-semibold">
                      {g.white.name} <span className="text-[12px] font-normal text-[var(--g-muted)]">{g.white.rating ?? ""}</span>
                    </span>
                    <span className="rounded bg-black/30 px-2 py-1 text-[13px] font-extrabold tabular-nums">{g.result === "1/2-1/2" ? "½–½" : g.result.replace("-", "–")}</span>
                    <span className="truncate text-right font-semibold">
                      <span className="text-[12px] font-normal text-[var(--g-muted)]">{g.black.rating ?? ""}</span> {g.black.name}
                    </span>
                    <span className="col-span-3 text-[12px] text-[var(--g-muted)]">
                      {g.moves} moves · {g.reason} · Replay
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="g-muted py-8 text-center">Finished games appear here, ready to replay.</p>
          ))}
        {tab === "stats" && <TourneyStats stats={view?.stats ?? { games: 0 }} />}
      </div>

      {profile && (
        <ProfileDialog
          open={profileOpen}
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSaved={(p) => {
            setProfile(p)
            setProfileOpen(false)
            void register()
          }}
        />
      )}
    </div>
  )
}
