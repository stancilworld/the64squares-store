"use client"

import { Chess, type Square } from "chess.js"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { io, type Socket } from "socket.io-client"
import { Board, type Colour, type Premove } from "@/components/chess/board"
import { type Fighter, MatchIntro, type Outcome, ResultBurst } from "@/components/chess/match-overlays"
import { material } from "@/components/chess/material"
import { MovePanel } from "@/components/chess/move-panel"
import { PlayerBar } from "@/components/chess/player-bar"
import { PlayLayout } from "@/components/chess/play-layout"
import { replay, START_FEN } from "@/lib/chess/replay"
import { playSound, soundForSan } from "@/lib/chess/sounds"
import type { PlayPass } from "@/lib/play"
import type { PublicProfile } from "@/lib/profile-types"
import { usePlayPass } from "./use-play-pass"
import { GAME_URL, type GameState, LIVE_KEY, type Presence, resultText, SPEED_LABEL, speedOf, tcText } from "@/lib/game-types"

type Props = { id: string; initialPass: PlayPass | null }
type Pending = { from: Square; to: Square; promotion?: "q" | "r" | "b" | "n" }

const noSubscribe = () => () => {}
const store = {
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v)
    } catch {}
  },
  clear: (k: string, only?: string) => {
    try {
      if (!only || window.localStorage.getItem(k) === only) window.localStorage.removeItem(k)
    } catch {}
  },
}

export function GameView({ id, initialPass }: Props) {
  const pass = usePlayPass(initialPass)
  const token = pass?.token ?? null
  const meId = pass?.me.id ?? null
  const router = useRouter()
  const socket = useRef<Socket | null>(null)
  const [game, setGame] = useState<GameState | null>(null)
  const [receivedAt, setReceivedAt] = useState(0)
  const [presence, setPresence] = useState<(Presence & { at: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [viewPly, setViewPly] = useState<number | null>(null) // null: follow the game
  const [flipped, setFlipped] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rematch, setRematch] = useState<{ by: string | null; declined?: boolean } | null>(null)
  // The time the clocks are drawn at, moved on by a timer while a clock runs.
  const [now, setNow] = useState(0)
  // The next arena game, opened after a short pause so the result can be seen.
  const [nextGame, setNextGame] = useState<string | null>(null)
  const [nextIn, setNextIn] = useState(3)
  const link = useSyncExternalStore(noSubscribe, () => window.location.href, () => "")
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({})

  // A move queued while the opponent thinks; played as soon as it's our turn, if still legal.
  const [premove, setPremoveState] = useState<Premove | null>(null)
  const premoveRef = useRef<Premove | null>(null)
  const meRef = useRef(meId)
  useEffect(() => {
    meRef.current = meId
  }, [meId])
  const setPremove = useCallback((p: Premove | null) => {
    premoveRef.current = p
    setPremoveState(p)
  }, [])

  const sendMove = useCallback((g: GameState, m: Pending) => {
    setPending(m)
    setViewPly(null)
    socket.current?.emit("game:move", { id: g.id, uci: `${m.from}${m.to}${m.promotion ?? ""}`, ply: g.moves.length }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        setPending(null)
        if (res.error === "illegal") setNotice("That move isn't allowed.")
      }
    })
  }, [])

  // The VS card when a game starts and the result animation when it ends: only for changes
  // seen live (not when opening a game that already started or finished).
  const [intro, setIntro] = useState(false)
  const [burst, setBurst] = useState(false)
  const lastStatus = useRef<string | null>(null)

  const apply = useCallback(
    (g: GameState) => {
      const t = performance.now()
      const before = lastStatus.current
      lastStatus.current = g.status
      if (g.status === "active" && before !== "active" && (before === "waiting" || g.moves.length < 2)) {
        let seen = false
        try {
          seen = window.sessionStorage.getItem(`t64:intro:${g.id}`) === "1"
          window.sessionStorage.setItem(`t64:intro:${g.id}`, "1")
        } catch {}
        if (!seen) setIntro(true)
      }
      if (before === "active" && g.status === "finished") {
        setIntro(false)
        setBurst(true)
      }
      setGame(g)
      setReceivedAt(t)
      setNow(t)
      setPending(null)
      const pm = premoveRef.current
      if (!pm) return
      const mine = g.white?.id === meRef.current ? "w" : g.black?.id === meRef.current ? "b" : null
      if (g.status !== "active" || !mine) return setPremove(null)
      if (g.turn !== mine) return
      setPremove(null)
      try {
        const c = new Chess(g.fen)
        const piece = c.get(pm.from)
        const promotion = piece?.type === "p" && (pm.to[1] === "8" || pm.to[1] === "1") ? "q" : undefined
        c.move({ from: pm.from, to: pm.to, promotion })
        sendMove(g, { ...pm, promotion })
      } catch {
        // No longer legal: the premove is simply dropped.
      }
    },
    [sendMove, setPremove]
  )

  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    const watch = () =>
      s.emit("game:watch", id, (res: { ok: boolean; game?: GameState; presence?: Presence | null; error?: string }) => {
        if (res.ok && res.game) {
          apply(res.game)
          setPresence(res.presence ? { ...res.presence, at: performance.now() } : null)
          setNotice(null)
        } else setError(res.error === "not-found" ? "This game doesn't exist." : "Couldn't load the game.")
      })
    s.on("connect", watch)
    s.on("game:state", (g: GameState) => g.id === id && apply(g))
    s.on("game:presence", (p: Presence) => p.id === id && setPresence({ ...p, at: performance.now() }))
    s.on("game:rematch", (r: { id: string; by?: string | null; game_id?: string; declined?: boolean }) => {
      if (r.id !== id) return
      if (r.game_id) router.push(`/play/${r.game_id}`)
      else setRematch({ by: r.by ?? null, declined: r.declined })
    })
    // In an arena the next pairing arrives as soon as this game ends.
    s.on("arena:paired", (p: { game_id: string }) => p.game_id !== id && setNextGame(p.game_id))
    s.on("connect_error", () => setNotice("Reconnecting…"))
    s.on("disconnect", () => setNotice("Connection lost. Reconnecting…"))
    return () => {
      s.disconnect()
    }
  }, [id, token, apply, router])

  useEffect(() => {
    if (!nextGame) return
    const t = setInterval(() => setNextIn((n) => n - 1), 1000)
    const go = setTimeout(() => router.push(`/play/${nextGame}`), 3000)
    return () => {
      clearInterval(t)
      clearTimeout(go)
    }
  }, [nextGame, router])

  // Redraw the clocks (and the "left the game" countdown) while the game runs.
  const active = game?.status === "active"
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(t)
  }, [active])

  // Pictures and levels of both players.
  const ids = [game?.white?.id, game?.black?.id].filter((x): x is string => !!x && x !== "computer").sort().join(",")
  useEffect(() => {
    if (!ids) return
    let live = true
    fetch(`${GAME_URL}/game/profiles?ids=${ids}`)
      .then((r) => r.json())
      .then((d: { profiles: PublicProfile[] }) => live && setProfiles(Object.fromEntries(d.profiles.map((p) => [p.player_id, p]))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [ids])

  // Measure our own round trip every few seconds while playing; the server shares it with the
  // opponent as signal bars.
  const [mySignal, setMySignal] = useState<number | null>(null)
  const pinging = active && !!meId && (game?.white?.id === meId || game?.black?.id === meId)
  useEffect(() => {
    if (!pinging) return
    let rtt: number | null = null
    const ping = () => {
      const s = socket.current
      if (!s?.connected) return setMySignal(0)
      const sent = performance.now()
      let answered = false
      s.emit("game:ping", { id, rtt }, () => {
        answered = true
        rtt = Math.round(performance.now() - sent)
        setMySignal(rtt < 150 ? 4 : rtt < 300 ? 3 : rtt < 600 ? 2 : 1)
      })
      setTimeout(() => !answered && setMySignal(1), 2500)
    }
    ping()
    const t = setInterval(ping, 4000)
    return () => clearInterval(t)
  }, [pinging, id])

  const myColour: Colour | null = game && meId ? (game.white?.id === meId ? "w" : game.black?.id === meId ? "b" : null) : null

  // Remember a live game in this browser, so the site can offer the way back to it.
  useEffect(() => {
    if (!game || !myColour) return
    if (game.status === "active") store.set(LIVE_KEY, game.id)
    else if (game.status === "finished" || game.status === "aborted") store.clear(LIVE_KEY, game.id)
  }, [game, myColour])

  const plies = useMemo(() => replay(game?.moves ?? []), [game?.moves])
  const latest = plies.length - 1
  const following = viewPly == null || viewPly >= latest
  const shownPly = following ? latest : viewPly

  // The position on the board, including our own move while the server confirms it.
  const optimistic = useMemo(() => {
    if (!pending || !game) return null
    try {
      const c = new Chess(game.fen)
      const m = c.move(pending)
      return { fen: c.fen(), san: m.san, from: m.from, to: m.to }
    } catch {
      return null
    }
  }, [pending, game])

  const fen = following && optimistic ? optimistic.fen : shownPly >= 0 ? plies[shownPly]?.fen ?? START_FEN : START_FEN
  const lastMove = following && optimistic ? { from: optimistic.from, to: optimistic.to } : shownPly >= 0 ? plies[shownPly] ?? null : null

  // Sounds: for every new move shown, and when the game starts or ends.
  const shownCount = useRef<number | null>(null)
  const count = (following ? plies.length + (optimistic ? 1 : 0) : shownPly + 1) || 0
  useEffect(() => {
    const before = shownCount.current
    shownCount.current = count
    if (before == null || before === count) return
    const san = following && optimistic ? optimistic.san : plies[count - 1]?.san
    if (count > 0) playSound(soundForSan(san))
  }, [count, following, optimistic, plies])
  const statusSeen = useRef<string | null>(null)
  useEffect(() => {
    if (!game) return
    const before = statusSeen.current
    statusSeen.current = game.status
    if (before === "waiting" && game.status === "active") playSound("start")
    if (before === "active" && (game.status === "finished" || game.status === "aborted")) playSound("end")
  }, [game])

  const elapsed = Math.max(0, now - receivedAt)
  const clockOf = (c: Colour) => (game ? Math.max(0, game.clock_running === c ? game.clocks[c] - elapsed : game.clocks[c]) : 0)
  const myClock = myColour ? clockOf(myColour) : Infinity
  const warned = useRef(false)
  useEffect(() => {
    if (!active || !game?.clock_running || game.clock_running !== myColour) return
    if (myClock < 10_000 && !warned.current) {
      warned.current = true
      playSound("lowtime")
    }
  }, [active, game?.clock_running, myColour, myClock])

  // Fair play: tell the server when the player comes back after leaving the game during their move.
  const awaySince = useRef<number | null>(null)
  const watchFocus = !!game && game.rated && active && !!myColour && game.turn === myColour
  useEffect(() => {
    if (!watchFocus) {
      awaySince.current = null
      return
    }
    const leave = () => {
      if (awaySince.current == null) awaySince.current = Date.now()
    }
    const back = () => {
      if (awaySince.current == null) return
      const away = Date.now() - awaySince.current
      awaySince.current = null
      if (away >= 1500) socket.current?.emit("game:focus", { id, away_ms: away })
    }
    const vis = () => (document.hidden ? leave() : back())
    document.addEventListener("visibilitychange", vis)
    window.addEventListener("blur", leave)
    window.addEventListener("focus", back)
    return () => {
      document.removeEventListener("visibilitychange", vis)
      window.removeEventListener("blur", leave)
      window.removeEventListener("focus", back)
    }
  }, [watchFocus, id])

  const emit = <T,>(event: string, payload: unknown) =>
    new Promise<T>((ok) => socket.current?.emit(event, payload, (res: T) => ok(res)))

  const onMove = (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
    if (!game) return false
    setPremove(null)
    sendMove(game, { from, to, promotion })
    return true
  }

  const goTo = useCallback((p: number) => setViewPly(p >= latest ? null : p), [latest])

  if (error) {
    return (
      <div className="py-16 text-center">
        <h1 className="g-title !text-[28px]">{error}</h1>
        <Link href="/play" className="g-btn g-btn-primary mt-6">
          Back to Play
        </Link>
      </div>
    )
  }
  if (!game) return <p className="py-16 text-center g-muted">Loading the game…</p>

  if (game.status === "waiting") {
    const mine = game.white?.id === meId || game.black?.id === meId
    const host = game.white ?? game.black
    return (
      <div className="g-panel mx-auto mt-4 max-w-[560px] p-6 text-center sm:p-8">
        <p className="text-[14px] g-muted">
          {tcText(game.initial_ms, game.increment_ms)} · {game.white ? "Challenger plays white" : "Challenger plays black"}
        </p>
        {mine ? (
          <>
            <h1 className="g-title !text-[28px] mt-2">Waiting for your opponent</h1>
            <p className="mt-3 text-[16px] g-muted">Send this link to a friend. The game starts as soon as they open it and accept.</p>
            <div className="mt-6 flex gap-2">
              <input readOnly value={link} aria-label="Game link" className="h-[48px] min-w-0 flex-1 rounded-md border border-[var(--g-line)] bg-[var(--g-panel-2)] px-3 text-[14px]" />
              <button
                type="button"
                className="g-btn g-btn-primary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <a
              className="g-btn mt-3 w-full"
              href={`https://wa.me/?text=${encodeURIComponent(`Play me at chess on The 64 Squares: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Send on WhatsApp
            </a>
            <button type="button" className="mt-6 text-[14px] g-muted underline underline-offset-4" onClick={() => emit("game:abort", id)}>
              Cancel this challenge
            </button>
          </>
        ) : (
          <>
            <h1 className="g-title !text-[28px] mt-2">{host?.name ?? "Someone"} challenges you</h1>
            {token ? (
              <button
                type="button"
                className="g-btn g-btn-primary mt-8 w-full"
                onClick={async () => {
                  const res = await emit<{ ok: boolean; error?: string }>("game:accept", id)
                  if (!res.ok) setNotice(res.error === "own-challenge" ? "That's your own challenge." : "This challenge is no longer open.")
                }}
              >
                Accept and play
              </button>
            ) : (
              <button type="button" disabled className="g-btn g-btn-primary mt-8 w-full">
                Getting ready…
              </button>
            )}
            {pass?.me.guest && (
              <p className="g-muted mt-3 text-[13px]">
                You&apos;ll play as {pass.me.name}.{" "}
                <Link href={`/account?next=${encodeURIComponent(`/play/${id}`)}`} className="text-[var(--g-gold)] underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to play under your own name.
              </p>
            )}
          </>
        )}
        {notice && <p className="mt-4 text-[14px] text-[#ff8a7d]">{notice}</p>}
      </div>
    )
  }

  const over = game.status === "finished" || game.status === "aborted"
  const orientation: "white" | "black" = (myColour === "b") !== flipped ? "black" : "white"
  const top: Colour = orientation === "white" ? "b" : "w"
  const bottom: Colour = top === "w" ? "b" : "w"
  const mat = material(fen)
  const firstMoveLeft = game.first_move_deadline ? game.first_move_deadline - game.server_now - elapsed : null
  const myTurn = active && game.turn === myColour
  const opp: Colour | null = myColour ? (myColour === "w" ? "b" : "w") : null
  const oppGone = presence && opp && !presence[opp].online && presence[opp].gone_ms != null ? presence[opp].gone_ms! + (now - presence.at) : null
  const claimIn = oppGone != null && presence ? Math.max(0, presence.claim_after_ms - oppGone) : null
  const hasClock = game.initial_ms > 0
  const speed = speedOf(game.initial_ms, game.increment_ms)

  const bar = (c: Colour) => {
    const p = c === "w" ? game.white : game.black
    const gone = active && presence && !presence[c].online && c !== myColour
    return (
      <PlayerBar
        name={p?.name ?? "Waiting…"}
        colour={c}
        rating={p?.rating}
        diff={over ? p?.diff : null}
        isBot={p?.id === "computer"}
        avatarUrl={p ? profiles[p.id]?.avatar_url : null}
        level={p ? profiles[p.id]?.level : null}
        href={p && profiles[p.id] ? `/play/player/${profiles[p.id].username}` : null}
        signal={active && presence && p?.id !== "computer" ? (c === myColour ? mySignal ?? presence[c].signal ?? 4 : presence[c].signal ?? (presence[c].online ? 4 : 0)) : null}
        taken={mat.taken[c]}
        lead={c === "w" ? mat.lead : -mat.lead}
        clock={hasClock ? { ms: clockOf(c), running: game.clock_running === c } : null}
        note={gone && claimIn != null ? "Left the game" : game.draw_offer === c && active ? <span className="text-[var(--g-gold)]">Offers a draw</span> : null}
      />
    )
  }

  const btn = "g-btn flex-1 px-3 text-[14px]"
  const statusCard = over ? (
    <div className="g-panel p-5 ring-1 ring-[var(--g-gold)]/40">
      <p className="g-title">{game.result === "1/2-1/2" ? "½–½" : game.result ?? "Aborted"}</p>
      <p className="mt-1 text-[15px] text-[var(--g-text)]">{resultText(game)}</p>
      {game.rated && myColour && (game[myColour === "w" ? "white" : "black"]?.diff ?? null) != null && (
        <p className="mt-1 text-[14px] text-[var(--g-gold)]">
          Your {SPEED_LABEL[speed].toLowerCase()} rating: {(game[myColour === "w" ? "white" : "black"]?.rating ?? 0) + (game[myColour === "w" ? "white" : "black"]?.diff ?? 0)} (
          {(game[myColour === "w" ? "white" : "black"]?.diff ?? 0) >= 0 ? "+" : ""}
          {game[myColour === "w" ? "white" : "black"]?.diff})
        </p>
      )}
      {game.mode === "arena" && myColour && (
        <p className="mt-2 text-[13px] text-[var(--g-gold)]">
          {nextGame ? `Next game in ${Math.max(nextIn, 1)}…` : "Stay on this page and your next arena game starts by itself."}
        </p>
      )}
      {rematch?.by && rematch.by !== meId && <p className="mt-2 text-[14px] font-medium text-[var(--g-gold)]">Your opponent wants a rematch.</p>}
      {rematch?.declined && <p className="mt-2 text-[13px] text-[var(--g-gold)]">Rematch declined.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {myColour && game.status === "finished" && (game.mode === "online" || game.mode === "friend") && (
          <>
            <button
              type="button"
              disabled={rematch?.by === meId}
              className="g-btn g-btn-primary h-[42px] disabled:opacity-60"
              onClick={async () => {
                const res = await emit<{ ok: boolean; error?: string }>("game:rematch", { id, action: "offer" })
                if (!res.ok) setNotice(res.error === "in-game" ? "One of you is already in another game." : "Rematch isn't available.")
              }}
            >
              {rematch?.by === meId ? "Rematch offered…" : rematch?.by ? "Accept rematch" : "Rematch"}
            </button>
            {rematch?.by && rematch.by !== meId && (
              <button type="button" className="g-btn" onClick={() => emit("game:rematch", { id, action: "decline" })}>
                Decline
              </button>
            )}
          </>
        )}
        {game.mode === "arena" && game.tournament_id ? (
          <Link href={`/play/arena/${game.tournament_id}`} className="g-btn g-btn-primary h-[42px]">
            Arena standings
          </Link>
        ) : game.mode === "computer" ? (
          <Link href="/play/computer" className="g-btn g-btn-primary h-[42px]">
            Play the computer
          </Link>
        ) : (
          <Link href={game.mode === "online" ? "/play/online" : "/play"} className="g-btn">
            New game
          </Link>
        )}
        {game.status === "finished" && game.moves.length >= 2 && (
          <Link href={`/play/analysis/${id}`} className="g-btn g-btn-primary h-[42px]">
            ★ Game review
          </Link>
        )}
        {game.status === "finished" && (
          <a href={`${GAME_URL}/game/games/${id}.pgn`} className="g-btn" download>
            PGN
          </a>
        )}
      </div>
    </div>
  ) : (
    <div className="g-panel p-4">
      <p className="text-[15px] font-medium">
        {firstMoveLeft != null && myTurn
          ? `Your first move: ${Math.max(0, Math.ceil(firstMoveLeft / 1000))} s left`
          : myColour
            ? myTurn
              ? "Your move"
              : "Waiting for your opponent…"
            : `${game.turn === "w" ? "White" : "Black"} to move`}
      </p>
      {oppGone != null && claimIn != null && (
        <div className="mt-3 rounded-lg bg-[var(--g-panel-3)] p-3 text-[14px]">
          {claimIn > 0 ? (
            <p>
              Your opponent left the game. If they don&apos;t return, you can claim the win in <b>{Math.ceil(claimIn / 1000)} s</b>.
            </p>
          ) : (
            <>
              <p>Your opponent left the game.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={`${btn} g-btn-primary`} onClick={() => emit("game:claim", { id, outcome: "win" })}>
                  Claim victory
                </button>
                <button type="button" className={`${btn}`} onClick={() => emit("game:claim", { id, outcome: "draw" })}>
                  Call it a draw
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {myColour && (
        <div className="mt-3 flex flex-wrap gap-2">
          {game.moves.length < 2 ? (
            <button type="button" className={`${btn}`} onClick={() => emit("game:abort", id)}>
              Abort
            </button>
          ) : game.draw_offer && game.draw_offer !== myColour ? (
            <>
              <button type="button" className={`${btn} g-btn-primary`} onClick={() => emit("game:draw", { id, action: "accept" })}>
                Accept draw
              </button>
              <button type="button" className={`${btn}`} onClick={() => emit("game:draw", { id, action: "decline" })}>
                Decline
              </button>
            </>
          ) : confirmResign ? (
            <>
              <button
                type="button"
                className={`${btn} g-btn-danger`}
                onClick={() => {
                  void emit("game:resign", id)
                  setConfirmResign(false)
                }}
              >
                Yes, resign
              </button>
              <button type="button" className={`${btn}`} onClick={() => setConfirmResign(false)}>
                Keep playing
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={game.draw_offer === myColour}
                className={`${btn} disabled:opacity-50`}
                onClick={() => emit("game:draw", { id, action: "offer" })}
              >
                ½ {game.draw_offer === myColour ? "Draw offered" : "Draw"}
              </button>
              <button type="button" className={`${btn}`} onClick={() => setConfirmResign(true)}>
                ⚑ Resign
              </button>
            </>
          )}
        </div>
      )}
      {notice && <p className="mt-3 text-[13px] text-[#ff8a7d]">{notice}</p>}
    </div>
  )

  const fighter = (c: Colour): Fighter => {
    const p = c === "w" ? game.white : game.black
    const prof = p ? profiles[p.id] : undefined
    return { name: p?.name ?? "…", colour: c, avatarUrl: prof?.avatar_url, rating: p?.rating, level: prof?.level, record: prof?.record, isBot: p?.id === "computer" }
  }
  let overlay: ReactNode = null
  if (intro && active) {
    const label = `${game.rated ? "Rated" : "Casual"} · ${SPEED_LABEL[speed]} ${tcText(game.initial_ms, game.increment_ms)}${game.mode === "arena" ? " · Arena" : ""}`
    overlay = <MatchIntro a={fighter(bottom)} b={fighter(top)} label={label} onDone={() => setIntro(false)} />
  } else if (burst && game.status === "finished" && game.result) {
    const winner: Colour | null = game.result === "1-0" ? "w" : game.result === "0-1" ? "b" : null
    const outcome: Outcome = !winner ? "draw" : myColour ? (winner === myColour ? "win" : "loss") : "neutral"
    const title = outcome === "win" ? "Victory" : outcome === "loss" ? "Defeat" : outcome === "draw" ? "Draw" : `${(winner === "w" ? game.white : game.black)?.name ?? "Winner"} wins`
    overlay = <ResultBurst outcome={outcome === "neutral" ? "win" : outcome} king={outcome === "loss" ? myColour ?? undefined : winner ?? undefined} title={title} detail={resultText(game)} onDone={() => setBurst(false)} />
  }

  return (
    <PlayLayout
      top={bar(top)}
      bottom={bar(bottom)}
      board={
        <Board
          id={`game-${id}`}
          fen={fen}
          orientation={orientation}
          movable={following && myTurn && !pending ? myColour : null}
          lastMove={lastMove}
          onMove={onMove}
          overlay={overlay}
          premoveFor={following && active && myColour && (!myTurn || pending) ? myColour : null}
          premove={active ? premove : null}
          onPremove={setPremove}
        />
      }
      panel={
        <>
          <p className="hidden items-center gap-2 text-[13px] g-muted lg:flex">
            <Link href={game.mode === "arena" && game.tournament_id ? `/play/arena/${game.tournament_id}` : "/play"} aria-label="Back" className="g-btn g-btn-ghost !min-h-[34px] !px-2 !text-[13px]">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </Link>
            <span className="flex-1">
              {game.mode === "computer" ? "Game vs computer" : `${game.rated ? "Rated" : "Casual"} · ${SPEED_LABEL[speed]} ${tcText(game.initial_ms, game.increment_ms)}`}
              {game.mode === "arena" ? " · Arena" : ""}
            </span>
            {!following && (
              <button type="button" className="font-medium text-[var(--g-gold)] underline underline-offset-2" onClick={() => setViewPly(null)}>
                Back to the game
              </button>
            )}
          </p>
          {statusCard}
          <MovePanel moves={game.moves} ply={shownPly} onGo={goTo} onFlip={() => setFlipped((f) => !f)} className="order-first lg:order-none" />
        </>
      }
    />
  )
}
