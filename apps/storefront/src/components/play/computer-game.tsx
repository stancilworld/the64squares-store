"use client"

import { GIcon } from "@/components/play-shell/icons"
import { Chess, type Square } from "chess.js"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { io } from "socket.io-client"
import { Board, type BoardArrow, type Colour, type Premove } from "@/components/chess/board"
import { MatchIntro, ResultBurst } from "@/components/chess/match-overlays"
import { ComputerSetup } from "./menu/computer-setup"
import { material } from "@/components/chess/material"
import { MovePanel } from "@/components/chess/move-panel"
import { PlayerBar } from "@/components/chess/player-bar"
import { PlayLayout } from "@/components/chess/play-layout"
import { Engine, LEVELS } from "@/lib/chess/engine"
import { START_FEN } from "@/lib/chess/replay"
import { playSound, soundForSan } from "@/lib/chess/sounds"
import { GAME_URL } from "@/lib/game-types"

type Saved = {
  level: number
  colour: Colour
  moves: string[] // UCI
  result?: { score: "1-0" | "0-1" | "1/2-1/2"; text: string } | null
  savedId?: string | null
}

const KEY = "t64:computer-game"
const load = (): Saved | null => {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Saved | null
    return s && Array.isArray(s.moves) && LEVELS.some((l) => l.level === s.level) ? s : null
  } catch {
    return null
  }
}
const keep = (s: Saved | null) => {
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s))
    else window.localStorage.removeItem(KEY)
  } catch {}
}

// Plays out UCI moves, keeping each position (for the move list and stepping back).
const build = (uci: string[]) => {
  const chess = new Chess()
  const plies: { san: string; fen: string; from: string; to: string }[] = []
  for (const u of uci) {
    try {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      plies.push({ san: m.san, fen: chess.fen(), from: m.from, to: m.to })
    } catch {
      break
    }
  }
  return { chess, plies }
}

const outcome = (chess: Chess, me: Colour): Saved["result"] => {
  if (chess.isCheckmate()) {
    const winner: Colour = chess.turn() === "w" ? "b" : "w"
    return { score: winner === "w" ? "1-0" : "0-1", text: winner === me ? "You won by checkmate" : "Computer won by checkmate" }
  }
  if (chess.isStalemate()) return { score: "1/2-1/2", text: "Draw by stalemate" }
  if (chess.isInsufficientMaterial()) return { score: "1/2-1/2", text: "Draw by insufficient material" }
  if (chess.isThreefoldRepetition()) return { score: "1/2-1/2", text: "Draw by threefold repetition" }
  if (chess.isDrawByFiftyMoves()) return { score: "1/2-1/2", text: "Draw by the fifty-move rule" }
  return null
}

const noSubscribe = () => () => {}

export function ComputerGame({ token, myName }: { token: string | null; myName: string | null }) {
  // Pick up an unfinished game from this browser (closing the tab never loses it).
  const router = useRouter()
  const loaded = useSyncExternalStore(noSubscribe, () => true, () => false)
  const restored = useMemo(() => (loaded ? load() : null), [loaded])
  const [changed, setGame] = useState<Saved | null | undefined>(undefined)
  const game = changed === undefined ? restored : changed
  const [setup, setSetup] = useState<{ level: number; colour: Colour | "random" }>({ level: 3, colour: "w" })
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [arrows, setArrows] = useState<BoardArrow[]>([])
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const engine = useRef<Engine | null>(null)
  const rev = useRef(0)

  useEffect(() => () => engine.current?.terminate(), [])
  const inflight = useRef<string | null>(null)
  const [intro, setIntro] = useState(false)
  const [burst, setBurst] = useState(false)
  // Moves queued while the computer thinks (one played per turn).
  const [premoves, setPremoveState] = useState<Premove[]>([])
  const premoveRef = useRef<Premove[]>([])
  const setPremoves = useCallback((p: Premove[]) => {
    premoveRef.current = p
    setPremoveState(p)
  }, [])

  const update = useCallback((next: Saved | null) => {
    rev.current++
    setGame(next)
    keep(next)
    setArrows([])
  }, [])

  const getEngine = () => (engine.current ??= new Engine())

  const { chess, plies } = useMemo(() => build(game?.moves ?? []), [game?.moves])
  const level = LEVELS.find((l) => l.level === (game?.level ?? setup.level)) ?? LEVELS[2]
  const over = !!game?.result
  const myTurn = !!game && !over && chess.turn() === game.colour
  const thinking = !!game && !over && chess.turn() !== game.colour

  // The computer's move.
  useEffect(() => {
    if (!game || !thinking) return
    const fen = chess.fen()
    const key = `${rev.current}:${fen}`
    if (inflight.current === key) return
    inflight.current = key
    const started = performance.now()
    void (async () => {
      let uci = await getEngine().bestMove(fen, level)
      // Lower levels sometimes play a casual move instead of the engine's choice.
      if (level.random && Math.random() < level.random) {
        const all = new Chess(fen).moves({ verbose: true })
        const pick = all[Math.floor(Math.random() * all.length)]
        if (pick) uci = `${pick.from}${pick.to}${pick.promotion ?? ""}`
      }
      const wait = 450 - (performance.now() - started)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      if (inflight.current !== key || !uci) return
      inflight.current = null
      let left = premoveRef.current
      {
        const g = game
        let moves = [...g.moves, uci!]
        let { chess: after } = build(moves)
        // Play the queued premove straight away if it's still legal.
        const [pm, ...rest] = premoveRef.current
        if (outcome(after, g.colour)) left = []
        if (pm && !outcome(after, g.colour)) {
          try {
            const piece = after.get(pm.from)
            const promo = piece?.type === "p" && (pm.to[1] === "8" || pm.to[1] === "1") ? "q" : ""
            after.move({ from: pm.from, to: pm.to, promotion: promo || undefined })
            moves = [...moves, `${pm.from}${pm.to}${promo}`]
            after = build(moves).chess
            left = rest
          } catch {
            left = []
          }
        }
        const next = { ...g, moves, result: outcome(after, g.colour) }
        keep(next)
        rev.current++
        setGame(next)
        if (next.result) setBurst(true)
      }
      if (left !== premoveRef.current) setPremoves(left)
    })()
  }, [game, thinking, chess, level, setPremoves])

  // Finished games go into the player's history (when signed in).
  useEffect(() => {
    if (!game?.result || game.savedId || !token || game.moves.length < 2) return
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    const resigned = !game.result.text.includes("checkmate") && !game.result.text.startsWith("Draw")
    s.emit("computer:save", { colour: game.colour, level: game.level, moves: game.moves, resigned }, (res: { ok: boolean; id?: string }) => {
      if (res.ok && res.id) {
        const next = { ...game, savedId: res.id }
        setGame(next)
        keep(next)
        setSaveNote("Saved to your games.")
      }
      s.disconnect()
    })
    return () => {
      s.disconnect()
    }
  }, [game, token])

  // Sounds for each new move on the board.
  const latest = plies.length - 1
  const following = viewPly == null || viewPly >= latest
  const shownPly = following ? latest : viewPly
  const shownCount = useRef<number | null>(null)
  useEffect(() => {
    const before = shownCount.current
    const count = shownPly + 1
    shownCount.current = count
    if (before == null || before === count || count === 0) return
    playSound(soundForSan(plies[count - 1]?.san))
  }, [shownPly, plies])
  const wasOver = useRef(over)
  useEffect(() => {
    if (over && !wasOver.current) playSound("end")
    wasOver.current = over
  }, [over])

  const goTo = useCallback((p: number) => setViewPly(p >= latest ? null : p), [latest])

  const start = (colour: Colour | "random", lvl: number) => {
    const c: Colour = colour === "random" ? (Math.random() < 0.5 ? "w" : "b") : colour
    setViewPly(null)
    setFlipped(false)
    setSaveNote(null)
    setPremoves([])
    update({ level: lvl, colour: c, moves: [], result: null, savedId: null })
    setBurst(false)
    setIntro(true)
    playSound("start")
  }

  const onMove = (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
    if (!game || !myTurn) return false
    const moves = [...game.moves, `${from}${to}${promotion ?? ""}`]
    const { chess: after } = build(moves)
    const result = outcome(after, game.colour)
    update({ ...game, moves, result })
    if (result) setBurst(true)
    setViewPly(null)
    return true
  }

  const takeBack = () => {
    if (!game || game.savedId) return
    engine.current?.stop()
    inflight.current = null
    setPremoves([])
    const moves = [...game.moves]
    // Back to the player's own turn, undoing their last move.
    do moves.pop()
    while (moves.length && (moves.length % 2 === 0 ? "w" : "b") !== game.colour)
    update({ ...game, moves, result: null })
    setViewPly(null)
  }

  const hint = async () => {
    if (!myTurn) return
    const at = rev.current
    const best = await getEngine().bestMove(chess.fen(), null, 700)
    if (best && at === rev.current) setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4) }])
  }

  if (!loaded) return <p className="py-16 text-center g-muted">Loading…</p>

  const colour: Colour = game?.colour ?? (setup.colour === "b" ? "b" : "w")
  const orientation: "white" | "black" = (colour === "b") !== flipped ? "black" : "white"
  const fen = game ? (shownPly >= 0 ? plies[shownPly].fen : START_FEN) : START_FEN
  const mat = material(fen)
  const top: Colour = orientation === "white" ? "b" : "w"
  const bottom: Colour = top === "w" ? "b" : "w"
  const bar = (c: Colour) =>
    c === colour ? (
      <PlayerBar name={myName ?? "You"} colour={c} taken={mat.taken[c]} lead={c === "w" ? mat.lead : -mat.lead} />
    ) : (
      <PlayerBar
        name={`Computer · Level ${level.level}`}
        colour={c}
        isBot
        taken={mat.taken[c]}
        lead={c === "w" ? mat.lead : -mat.lead}
        note={thinking ? <span className="g-muted">Thinking…</span> : null}
      />
    )

  const btn = "g-btn flex-1 px-3 text-[14px]"

  if (!game) {
    return <ComputerSetup setup={setup} onChange={setSetup} onStart={() => start(setup.colour, setup.level)} signedIn={!!token} />
  }

  const panel = (
    <>
      <p className="hidden items-center gap-2 text-[13px] g-muted lg:flex">
        <Link href={"/play"} aria-label="Back" className="g-btn g-btn-ghost !min-h-[34px] !px-2 !text-[13px]">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </Link>
        <span className="flex-1">
          vs Computer · Level {level.level} ({level.name})
        </span>
        {!following && (
          <button type="button" className="font-medium text-[var(--g-accent)] underline underline-offset-2" onClick={() => setViewPly(null)}>
            Back to the game
          </button>
        )}
      </p>
      {over ? (
        <div className="g-panel p-5 ring-1 ring-[var(--g-accent)]/40">
          <p className="g-title">{game.result!.score === "1/2-1/2" ? "½–½" : game.result!.score}</p>
          <p className="mt-1 text-[15px] text-[var(--g-text)]">{game.result!.text}</p>
          {saveNote && game.savedId && (
            <p className="mt-1 text-[13px] text-[var(--g-accent)]">
              {saveNote}{" "}
              <Link href="/play/history" className="underline underline-offset-2">
                Game history
              </Link>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="g-btn g-btn-primary h-[42px]" onClick={() => start(game.colour === "w" ? "b" : "w", game.level)}>
              Play again
            </button>
            <button type="button" className="g-btn" onClick={() => update(null)}>
              Change level
            </button>
            {game.moves.length >= 2 &&
              (game.savedId ? (
                <Link href={`/play/analysis/${game.savedId}`} className="g-btn">
                  <GIcon name="star" size={18} />
            Game review
                </Link>
              ) : (
                <button
                  type="button"
                  className="g-btn"
                  onClick={() => {
                    try {
                      window.sessionStorage.setItem(
                        "t64:analyse",
                        JSON.stringify({
                          moves: game.moves,
                          white: game.colour === "w" ? (myName ?? "You") : `Computer (level ${game.level})`,
                          black: game.colour === "b" ? (myName ?? "You") : `Computer (level ${game.level})`,
                          result: game.result?.score ?? null,
                          me: game.colour,
                        })
                      )
                    } catch {}
                    router.push("/play/analysis/local")
                  }}
                >
                  <GIcon name="star" size={18} />
            Game review
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="g-panel p-4">
          <p className="text-[15px] font-medium">{thinking ? "The computer is thinking…" : myTurn ? "Your move" : "…"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${btn}`} disabled={!myTurn} onClick={hint}>
              <GIcon name="bulb" size={18} />
              Hint
            </button>
            <button type="button" className={`${btn}`} disabled={game.moves.length < 1} onClick={takeBack}>
              <GIcon name="undo" size={18} />
              Take back
            </button>
            <button
              type="button"
              className={`${btn}`}
              onClick={() => {
                update({ ...game, result: { score: game.colour === "w" ? "0-1" : "1-0", text: "You resigned" } })
                setBurst(true)
              }}
            >
              <GIcon name="flag" size={18} />
              Resign
            </button>
          </div>
        </div>
      )}
      <MovePanel moves={plies.map((p) => p.san)} ply={shownPly} onGo={goTo} onFlip={() => setFlipped((f) => !f)} className="order-first lg:order-none" />
    </>
  )

  return (
    <PlayLayout
      boardOnPhones
      top={bar(top)}
      bottom={bar(bottom)}
      board={
        <Board
          id="computer"
          fen={fen}
          orientation={orientation}
          movable={following && myTurn && !thinking ? colour : null}
          lastMove={shownPly >= 0 ? plies[shownPly] : null}
          arrows={arrows}
          onMove={onMove}
          overlay={
            intro && game && !over ? (
              <MatchIntro
                a={{ name: myName ?? "You", colour: game.colour }}
                b={{ name: `Computer`, colour: game.colour === "w" ? "b" : "w", isBot: true, level: null, rating: null }}
                label={`Level ${level.level} · ${level.name}`}
                onDone={() => setIntro(false)}
              />
            ) : burst && game?.result ? (
              <ResultBurst
                outcome={game.result.score === "1/2-1/2" ? "draw" : (game.result.score === "1-0") === (game.colour === "w") ? "win" : "loss"}
                king={game.result.score === "1/2-1/2" ? undefined : game.colour}
                title={game.result.score === "1/2-1/2" ? "Draw" : (game.result.score === "1-0") === (game.colour === "w") ? "Victory" : "Defeat"}
                detail={game.result.text}
                onDone={() => setBurst(false)}
              />
            ) : null
          }
          premoveFor={following && thinking ? game!.colour : null}
          premoves={thinking ? premoves : undefined}
          onPremoves={setPremoves}
        />
      }
      panel={panel}
    />
  )
}
