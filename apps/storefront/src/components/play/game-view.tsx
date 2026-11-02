"use client"

import { Chess, type Square } from "chess.js"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Chessboard } from "react-chessboard"
import { io, type Socket } from "socket.io-client"
import { type Colour, GAME_URL, type GameState, resultText } from "@/lib/game-types"

const DARK = "#8b5a3c"
const LIGHT = "#ecd9b6"
const PROMOTIONS = [
  ["q", "Queen"],
  ["r", "Rook"],
  ["b", "Bishop"],
  ["n", "Knight"],
] as const

type Props = { id: string; token: string | null; meId: string | null }

const noSubscribe = () => () => {}

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  if (s < 10) return s.toFixed(1)
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, "0")}`
}

function Clock({ ms, running, low }: { ms: number; running: boolean; low: boolean }) {
  return (
    <span
      className={`min-w-[96px] rounded-md px-3 py-1.5 text-right font-mono text-[22px] tabular-nums ${
        running ? (low ? "bg-love text-white" : "bg-velvet text-white") : "bg-linen text-black"
      }`}
    >
      {fmt(ms)}
    </span>
  )
}

export function GameView({ id, token, meId }: Props) {
  const router = useRouter()
  const socket = useRef<Socket | null>(null)
  const [game, setGame] = useState<GameState | null>(null)
  const [receivedAt, setReceivedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [copied, setCopied] = useState(false)
  // The time the clocks are drawn at, moved on by a timer while a clock runs.
  const [now, setNow] = useState(0)
  // The next arena game, opened after a short pause so the result can be seen.
  const [nextGame, setNextGame] = useState<string | null>(null)
  const [nextIn, setNextIn] = useState(3)

  const apply = useCallback((g: GameState) => {
    const t = performance.now()
    setGame(g)
    setReceivedAt(t)
    setNow(t)
    setSelected(null)
  }, [])

  useEffect(() => {
    const s = io(GAME_URL, { path: "/game/socket.io", auth: token ? { token } : {}, transports: ["websocket", "polling"] })
    socket.current = s
    const watch = () =>
      s.emit("game:watch", id, (res: { ok: boolean; game?: GameState; error?: string }) => {
        if (res.ok && res.game) apply(res.game)
        else setError(res.error === "not-found" ? "This game doesn't exist." : "Couldn't load the game.")
      })
    s.on("connect", watch)
    s.on("game:state", (g: GameState) => g.id === id && apply(g))
    // In an arena the next pairing arrives as soon as this game ends.
    s.on("arena:paired", (p: { game_id: string }) => p.game_id !== id && setNextGame(p.game_id))
    s.on("connect_error", () => setNotice("Reconnecting…"))
    s.io.on("reconnect", () => setNotice(null))
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

  // Redraw the clocks while one is running.
  useEffect(() => {
    if (!game || game.status !== "active") return
    const t = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(t)
  }, [game])

  // The page address, known only in the browser.
  const link = useSyncExternalStore(noSubscribe, () => window.location.href, () => "")

  const myColour: Colour | null = game && meId ? (game.white?.id === meId ? "w" : game.black?.id === meId ? "b" : null) : null
  const orientation = myColour === "b" ? "black" : "white"
  const chess = useMemo(() => (game ? new Chess(game.fen) : null), [game])
  const myTurn = !!game && game.status === "active" && game.turn === myColour

  const emit = <T,>(event: string, payload: unknown) =>
    new Promise<T>((ok) => socket.current?.emit(event, payload, (res: T) => ok(res)))

  const send = async (from: Square, to: Square, promo?: string) => {
    if (!game) return
    const res = await emit<{ ok: boolean; error?: string }>("game:move", { id, uci: `${from}${to}${promo ?? ""}`, ply: game.moves.length })
    if (!res.ok && res.error !== "stale") setNotice(res.error === "illegal" ? "That move isn't allowed." : null)
  }

  const isPromotion = (from: Square, to: Square) => {
    const p = chess?.get(from)
    return !!p && p.type === "p" && (to[1] === "8" || to[1] === "1")
  }

  const tryMove = (from: Square, to: Square) => {
    if (!chess || !myTurn) return false
    const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to)
    if (!legal) return false
    if (isPromotion(from, to)) {
      setPromotion({ from, to })
      return false
    }
    void send(from, to)
    return true
  }

  const onSquareClick = (square: Square) => {
    if (!chess || !myTurn) return
    const piece = chess.get(square)
    if (selected && selected !== square && tryMove(selected, square)) {
      setSelected(null)
      return
    }
    setSelected(piece && piece.color === myColour ? square : null)
  }

  const squareStyles = useMemo(() => {
    const st: Record<string, React.CSSProperties> = {}
    if (game?.last_move) {
      st[game.last_move.from] = { background: "rgba(176, 138, 78, 0.45)" }
      st[game.last_move.to] = { background: "rgba(176, 138, 78, 0.6)" }
    }
    if (chess && game?.in_check) {
      const king = chess.board().flat().find((p) => p && p.type === "k" && p.color === game.turn)
      if (king) st[king.square] = { ...st[king.square], boxShadow: "inset 0 0 0 4px #b3261e" }
    }
    if (chess && selected) {
      st[selected] = { ...st[selected], background: "rgba(31, 58, 43, 0.45)" }
      for (const m of chess.moves({ square: selected, verbose: true })) {
        st[m.to] = {
          ...st[m.to],
          backgroundImage: m.captured
            ? "radial-gradient(transparent 58%, rgba(31,58,43,0.55) 60%)"
            : "radial-gradient(rgba(31,58,43,0.5) 22%, transparent 24%)",
        }
      }
    }
    return st
  }, [game, chess, selected])

  if (error) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display h-page">{error}</h1>
        <Link href="/play" className="btn btn-solid mt-6">
          Start a new game
        </Link>
      </div>
    )
  }
  if (!game) return <p className="py-16 text-center text-muted">Loading the game…</p>

  const elapsed = Math.max(0, now - receivedAt)
  const clockOf = (c: Colour) => (game.clock_running === c ? game.clocks[c] - elapsed : game.clocks[c])
  const firstMoveLeft = game.first_move_deadline ? game.first_move_deadline - game.server_now - elapsed : null
  const top: Colour = orientation === "white" ? "b" : "w"
  const bottom: Colour = top === "w" ? "b" : "w"
  const nameOf = (c: Colour) => (c === "w" ? game.white : game.black)?.name ?? "Waiting for opponent"
  const over = game.status === "finished" || game.status === "aborted"
  const rows: [string, string | undefined][] = []
  for (let i = 0; i < game.moves.length; i += 2) rows.push([game.moves[i], game.moves[i + 1]])

  const playerBar = (c: Colour) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full border border-black/30 ${c === "w" ? "bg-white" : "bg-black"}`} />
        <span className="truncate text-[15px] font-medium">{nameOf(c)}</span>
        {game.draw_offer === c && <span className="rounded bg-maple-soft px-2 py-0.5 text-[12px]">offers a draw</span>}
      </div>
      <Clock ms={clockOf(c)} running={game.clock_running === c} low={clockOf(c) < 20_000} />
    </div>
  )

  if (game.status === "waiting") {
    const mine = game.white?.id === meId || game.black?.id === meId
    const host = game.white ?? game.black
    return (
      <div className="mx-auto max-w-[560px] py-6 text-center">
        <p className="text-[14px] text-muted">
          {game.initial_ms / 60000}+{game.increment_ms / 1000} · {game.white ? "Challenger plays white" : "Challenger plays black"}
        </p>
        {mine ? (
          <>
            <h1 className="font-display h-page mt-2">Waiting for your opponent</h1>
            <p className="mt-3 text-[16px] text-muted">Send this link to a friend. The game starts as soon as they open it and accept.</p>
            <div className="mt-6 flex gap-2">
              <input readOnly value={link} aria-label="Game link" className="h-[48px] min-w-0 flex-1 rounded-md border border-rule bg-linen px-3 text-[14px]" />
              <button
                type="button"
                className="btn btn-solid"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <a
              className="btn btn-outline mt-3 w-full"
              href={`https://wa.me/?text=${encodeURIComponent(`Play me at chess on The 64 Squares: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Send on WhatsApp
            </a>
            <button type="button" className="mt-6 text-[14px] text-muted underline underline-offset-4" onClick={() => emit("game:abort", id)}>
              Cancel this challenge
            </button>
          </>
        ) : (
          <>
            <h1 className="font-display h-page mt-2">{host?.name ?? "Someone"} challenges you</h1>
            {token ? (
              <button
                type="button"
                className="btn btn-solid mt-8 w-full"
                onClick={async () => {
                  const res = await emit<{ ok: boolean; error?: string }>("game:accept", id)
                  if (!res.ok) setNotice(res.error === "own-challenge" ? "That's your own challenge." : "This challenge is no longer open.")
                }}
              >
                Accept and play
              </button>
            ) : (
              <Link href={`/account?next=${encodeURIComponent(`/play/${id}`)}`} className="btn btn-solid mt-8 w-full">
                Sign in to play
              </Link>
            )}
          </>
        )}
        {notice && <p className="mt-4 text-[14px] text-love">{notice}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        {playerBar(top)}
        <div className="relative">
          <Chessboard
            options={{
              id: `game-${id}`,
              position: game.fen,
              boardOrientation: orientation,
              allowDragging: myTurn,
              onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && tryMove(sourceSquare as Square, targetSquare as Square),
              onSquareClick: ({ square }) => onSquareClick(square as Square),
              darkSquareStyle: { backgroundColor: DARK },
              lightSquareStyle: { backgroundColor: LIGHT },
              squareStyles,
              animationDurationInMs: 150,
            }}
          />
          {promotion && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
              <div role="dialog" aria-label="Promote to" className="rounded-md bg-white p-4 text-center shadow-lg">
                <p className="text-[14px] font-medium">Promote to</p>
                <div className="mt-3 flex gap-2">
                  {PROMOTIONS.map(([p, label]) => (
                    <button
                      key={p}
                      type="button"
                      className="btn btn-outline h-[44px] px-3"
                      onClick={() => {
                        void send(promotion.from, promotion.to, p)
                        setPromotion(null)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="mt-3 text-[13px] text-muted underline" onClick={() => setPromotion(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {playerBar(bottom)}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        {over ? (
          <div className="rounded-md bg-velvet p-5 text-white">
            <p className="font-display h-sub">{game.result ?? "Aborted"}</p>
            <p className="mt-1 text-[15px] text-maple-soft">{resultText(game)}</p>
            {game.mode === "arena" && myColour && (
              <p className="mt-2 text-[13px] text-maple">
                {nextGame ? `Next game in ${Math.max(nextIn, 1)}…` : "Stay on this page and your next arena game starts by itself."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {game.mode === "arena" && game.tournament_id ? (
                <Link href={`/tournaments/${game.tournament_id}/arena`} className="btn btn-light">
                  Arena standings
                </Link>
              ) : (
                <Link href="/play" className="btn btn-light">
                  New game
                </Link>
              )}
              {game.status === "finished" && (
                <a href={`${GAME_URL}/game/games/${id}.pgn`} className="btn border border-white/40 text-white hover:bg-white/10" download>
                  Download PGN
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-rule p-4">
            <p className="text-[15px]">
              {firstMoveLeft != null && myTurn
                ? `Your first move: ${Math.max(0, Math.ceil(firstMoveLeft / 1000))} s left`
                : myColour
                  ? myTurn
                    ? "Your move"
                    : "Waiting for your opponent's move"
                  : `${game.turn === "w" ? "White" : "Black"} to move`}
            </p>
            {myColour && (
              <div className="mt-3 flex flex-wrap gap-2">
                {game.moves.length < 2 ? (
                  <button type="button" className="btn btn-outline h-[40px]" onClick={() => emit("game:abort", id)}>
                    Abort
                  </button>
                ) : (
                  <>
                    {game.draw_offer && game.draw_offer !== myColour ? (
                      <>
                        <button type="button" className="btn btn-solid h-[40px]" onClick={() => emit("game:draw", { id, action: "accept" })}>
                          Accept draw
                        </button>
                        <button type="button" className="btn btn-outline h-[40px]" onClick={() => emit("game:draw", { id, action: "decline" })}>
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={game.draw_offer === myColour}
                        className="btn btn-outline h-[40px] disabled:opacity-50"
                        onClick={() => emit("game:draw", { id, action: "offer" })}
                      >
                        {game.draw_offer === myColour ? "Draw offered" : "Offer a draw"}
                      </button>
                    )}
                    {confirmResign ? (
                      <>
                        <button
                          type="button"
                          className="btn h-[40px] bg-love text-white"
                          onClick={() => {
                            void emit("game:resign", id)
                            setConfirmResign(false)
                          }}
                        >
                          Yes, resign
                        </button>
                        <button type="button" className="btn btn-outline h-[40px]" onClick={() => setConfirmResign(false)}>
                          Keep playing
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-outline h-[40px]" onClick={() => setConfirmResign(true)}>
                        Resign
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {notice && <p className="mt-3 text-[13px] text-love">{notice}</p>}
          </div>
        )}

        <div className="rounded-md border border-rule">
          <p className="border-b border-rule px-4 py-2.5 text-[13px] font-medium text-muted">
            Moves · {game.initial_ms / 60000}+{game.increment_ms / 1000}
          </p>
          {rows.length ? (
            <ol className="max-h-[360px] overflow-y-auto px-4 py-2 font-mono text-[14px]">
              {rows.map(([w, b], i) => (
                <li key={i} className="grid grid-cols-[36px_1fr_1fr] py-0.5">
                  <span className="text-muted">{i + 1}.</span>
                  <span>{w}</span>
                  <span>{b ?? ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-3 text-[14px] text-muted">No moves yet.</p>
          )}
        </div>
        {!myColour && <p className="text-[13px] text-muted">You are watching this game.</p>}
      </aside>
    </div>
  )
}
