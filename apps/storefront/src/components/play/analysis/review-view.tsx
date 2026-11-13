"use client"

import { Chess } from "chess.js"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { coachIntro, coachLine, coachSummary, keyMoment } from "@/lib/chess/coach"
import { useCoachVoice } from "./coach-voice"
import { Board } from "@/components/chess/board"
import { PlayLayout } from "@/components/chess/play-layout"
import { GIcon } from "@/components/play-shell/icons"
import { Engine } from "@/lib/chess/engine"
import { type Eval, evalText, gameAccuracy, KINDS, type Kind, type Reviewed, reviewGame, whiteWin } from "@/lib/chess/review"
import { playSound, soundForSan } from "@/lib/chess/sounds"

export type ReviewGame = {
  key: string
  white: string
  black: string
  whiteRating?: number | null
  blackRating?: number | null
  result?: string | null
  moves: string[] // SAN or UCI
  me?: "w" | "b" | null
  back: string
}

const DEPTH = 13
const ORDER: Kind[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"]

// Moves as SAN, whether they were stored as SAN or UCI.
const toSans = (moves: string[]) => {
  const c = new Chess()
  const sans: string[] = []
  for (const m of moves) {
    try {
      sans.push(c.move(m).san)
    } catch {
      try {
        sans.push(c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san)
      } catch {
        break
      }
    }
  }
  return sans
}

const cacheGet = (key: string): Eval[] | null => {
  try {
    const v = JSON.parse(window.localStorage.getItem(`t64:review:${key}`) ?? "null")
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
const cacheSet = (key: string, evals: Eval[]) => {
  try {
    window.localStorage.setItem(`t64:review:${key}`, JSON.stringify(evals))
  } catch {}
}

// Game review: the engine checks every move; the board steps through them with the best
// move shown wherever a better one existed.
export function ReviewView({ game }: { game: ReviewGame }) {
  const sans = useMemo(() => toSans(game.moves), [game.moves])
  const [evals, setEvals] = useState<Eval[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [ply, setPly] = useState(0) // positions after `ply` moves
  const [flipped, setFlipped] = useState(game.me === "b")

  useEffect(() => {
    const cached = cacheGet(game.key)
    if (cached && cached.length === sans.length + 1) {
      const t = setTimeout(() => setEvals(cached), 0)
      return () => clearTimeout(t)
    }
    let live = true
    const engine = new Engine()
    ;(async () => {
      const c = new Chess()
      const fens = [c.fen()]
      for (const s of sans) {
        c.move(s)
        fens.push(c.fen())
      }
      const out: Eval[] = []
      for (let i = 0; i < fens.length; i++) {
        if (!live) return
        const pos = new Chess(fens[i])
        if (pos.isCheckmate()) out.push({ cp: null, mate: 0, best: null, pv: [] })
        else if (pos.isDraw() || pos.isStalemate()) out.push({ cp: 0, mate: null, best: null, pv: [] })
        else out.push(await engine.analyse(fens[i], DEPTH))
        setProgress(i + 1)
      }
      if (!live) return
      cacheSet(game.key, out)
      setEvals(out)
    })()
    return () => {
      live = false
      engine.terminate()
    }
  }, [game.key, sans])

  const reviewed = useMemo(() => (evals ? reviewGame(sans, evals) : []), [evals, sans])
  const total = sans.length

  // The coach: a line for every move, an opening word and the turning point.
  const ctx = useMemo(() => ({ me: game.me ?? null, white: game.white, black: game.black }), [game.me, game.white, game.black])
  const lines = useMemo(() => (evals ? reviewed.map((r, i) => coachLine(r, evals[i], evals[i + 1], ctx, i + 1)) : []), [reviewed, evals, ctx])
  const intro = useMemo(() => (evals && reviewed.length ? coachIntro(ctx, gameAccuracy(reviewed, "w") ?? 0, gameAccuracy(reviewed, "b") ?? 0, game.result, reviewed) : null), [evals, reviewed, ctx, game.result])
  const summary = useMemo(() => (reviewed.length ? coachSummary(reviewed, ctx) : null), [reviewed, ctx])
  const voice = useCoachVoice()
  const [touring, setTouring] = useState(false)
  // Which guided review is running (stepping by hand or stopping starts a new count).
  const tour = useRef(0)

  const go = useCallback(
    (p: number, fromTour = false) => {
      const n = Math.max(0, Math.min(total, p))
      setPly(n)
      if (n > 0) playSound(soundForSan(sans[n - 1]))
      if (fromTour) return
      // Stepping by hand stops the guided review; the coach says this move's line.
      tour.current++
      setTouring(false)
      if (n > 0 && lines[n - 1]) void voice.say(lines[n - 1].say)
      else voice.stop()
    },
    [total, sans, lines, voice]
  )

  // "Play review": the coach goes through the game, stopping to talk at the moments that
  // matter (mistakes, blunders, brilliant and great moves) and moving briskly through the rest.
  const playReview = useCallback(async () => {
    const mine = ++tour.current
    setTouring(true)
    const live = () => mine === tour.current
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    let p = ply >= total ? 0 : ply
    if (p === 0) {
      setPly(0)
      if (intro) await voice.say(intro.say, true)
    }
    while (live() && p < total) {
      p++
      go(p, true)
      const r = reviewed[p - 1]
      const next = reviewed.findIndex((m, i) => i >= p && keyMoment(m, i === total - 1))
      if (next >= 0 && lines[next]) void voice.prefetch(lines[next].say)
      if (r && keyMoment(r, p === total)) await voice.say(lines[p - 1].say, true)
      else await wait(850)
      if (live()) await wait(350)
    }
    if (live() && summary) await voice.say(summary.say, true)
    if (live()) setTouring(false)
  }, [ply, total, intro, summary, voice, go, reviewed, lines])

  const stopReview = useCallback(() => {
    tour.current++
    setTouring(false)
    voice.stop()
  }, [voice])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowLeft") go(ply - 1)
      else if (e.key === "ArrowRight") go(ply + 1)
      else if (e.key === "ArrowUp" || e.key === "Home") go(0)
      else if (e.key === "ArrowDown" || e.key === "End") go(total)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [go, ply, total])

  const cur: Reviewed | null = ply > 0 ? (reviewed[ply - 1] ?? null) : null
  const fen = useMemo(() => {
    const c = new Chess()
    for (const s of sans.slice(0, ply)) c.move(s)
    return c.fen()
  }, [sans, ply])
  const whiteToMove = fen.split(" ")[1] === "w"
  const evalNow = evals?.[ply]
  const win = evalNow ? whiteWin(evalNow, whiteToMove) : 50
  const orientation = flipped ? "black" : "white"

  const showBest = cur && cur.best && !["best", "book", "forced", "brilliant", "great"].includes(cur.kind)
  const arrows = showBest ? [{ from: cur!.best!.slice(0, 2), to: cur!.best!.slice(2, 4), color: "rgba(129, 182, 76, 0.85)" }] : []
  const marks: Record<string, string> = cur ? { [cur.from]: `${KINDS[cur.kind].colour}66`, [cur.to]: `${KINDS[cur.kind].colour}99` } : {}

  // The move's symbol in the corner of its square.
  const badge = cur ? (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {(() => {
        const f = cur.to.charCodeAt(0) - 97
        const r = Number(cur.to[1]) - 1
        const col = orientation === "white" ? f : 7 - f
        const row = orientation === "white" ? 7 - r : r
        return (
          <span
            className="absolute grid h-[34%] max-h-[30px] min-h-[20px] w-auto -translate-y-1/3 translate-x-[-40%] place-items-center rounded-full px-1.5 text-[12px] font-black text-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] ring-2 ring-white/80"
            style={{ left: `${(col + 1) * 12.5}%`, top: `${row * 12.5}%`, background: KINDS[cur.kind].colour, height: "4.2%", minWidth: "4.2%" }}
          >
            {KINDS[cur.kind].symbol}
          </span>
        )
      })()}
    </div>
  ) : null

  const evalBar = (
    <div className="flex h-[40px] items-center gap-2">
      <span className="w-[46px] text-right font-mono text-[13px] font-bold">{evalNow ? evalText(evalNow, whiteToMove) : "…"}</span>
      <div className="relative h-[12px] flex-1 overflow-hidden rounded-full bg-[#2a2622] ring-1 ring-white/10">
        <div className="absolute inset-y-0 left-0 bg-[#f3ead8] transition-[width] duration-500" style={{ width: `${win}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--g-accent)]/60" />
      </div>
    </div>
  )

  const accW = evals ? gameAccuracy(reviewed, "w") : null
  const accB = evals ? gameAccuracy(reviewed, "b") : null
  const count = (colour: "w" | "b", k: Kind) => reviewed.filter((m) => m.colour === colour && m.kind === k).length

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-y-auto [&>*]:shrink-0">
      <div className="hidden items-center gap-2 lg:flex">
        <Link href={game.back} aria-label="Back" className="g-btn g-btn-ghost !min-h-[36px] !w-[36px] !px-0">
          <GIcon name="back" size={18} />
        </Link>
        <h1 className="g-title flex-1">Game review</h1>
      </div>

      {!evals ? (
        <div className="g-panel p-5">
          <p className="text-[17px] font-bold">Analysing the game…</p>
          <p className="g-muted mt-1 text-[13px]">
            The engine is checking every move ({progress}/{total + 1}). You can step through the moves meanwhile.
          </p>
          <div className="menu-xp mt-3 h-[8px] overflow-hidden rounded-full">
            <span className="block h-full rounded-full transition-[width]" style={{ width: `${(progress / (total + 1)) * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          {/* This move */}
          <div className="g-panel min-h-[104px] p-4" aria-live="polite">
            {cur ? (
              <>
                <p className="flex items-center gap-2 text-[17px] font-bold">
                  <span className="grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[12px] font-black text-white" style={{ background: KINDS[cur.kind].colour }}>
                    {KINDS[cur.kind].symbol}
                  </span>
                  <span>
                    {Math.ceil(ply / 2)}
                    {cur.colour === "w" ? "." : "…"} {cur.san} is {cur.kind === "excellent" || cur.kind === "inaccuracy" ? "an" : "a"}{" "}
                    <span style={{ color: KINDS[cur.kind].colour }}>{KINDS[cur.kind].label.toLowerCase()}</span>
                    {cur.kind === "best" || cur.kind === "great" || cur.kind === "brilliant" ? " move" : ""}
                  </span>
                  <span className="ml-auto font-mono text-[14px] text-[var(--g-muted)]">{cur.evalAfter}</span>
                </p>
                {(() => {
                  const l = lines[ply - 1]
                  const text = l ? (l.detail ?? l.text) : ""
                  return text ? <p className="mt-1.5 text-[14px] leading-relaxed text-white/80">{text}</p> : null
                })()}
                {showBest && cur.bestSan && <p className="g-muted mt-1 text-[12px]">The green arrow shows {cur.bestSan}.</p>}
              </>
            ) : intro ? (
              <p className="text-[14px] leading-relaxed text-white/80">{intro.text}</p>
            ) : (
              <p className="g-muted text-[14px]">Use the arrows (or ← → on the keyboard) to go through the game. Coloured symbols show how good each move was.</p>
            )}
            {ply === total && summary && total > 0 && <p className="mt-2 text-[13px] font-semibold text-[var(--g-accent)]">{summary.text}</p>}
          </div>

          {/* The coach: a guided review, read aloud. */}
          <div className="flex items-center gap-2">
            {touring ? (
              <button type="button" onClick={stopReview} className="g-btn flex-1 !min-h-[44px]">
                <span aria-hidden="true">■</span> Stop the review
              </button>
            ) : (
              <button type="button" onClick={() => void playReview()} className="g-btn g-btn-primary flex-1 !min-h-[44px]">
                <span aria-hidden="true">▶</span> {ply > 0 && ply < total ? "Play review from here" : "Play review"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (voice.on) voice.stop()
                voice.toggle()
              }}
              aria-pressed={voice.on}
              aria-label={voice.on ? "Coach voice on (turn off)" : "Coach voice off (turn on)"}
              title={voice.on ? "Coach voice on" : "Coach voice off"}
              className={`g-btn !min-h-[44px] !w-[52px] !px-0 ${voice.speaking ? "ring-2 ring-[var(--g-accent)]" : ""}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                {voice.on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m22 9-6 6M16 9l6 6" />}
              </svg>
            </button>
          </div>

          <Graph reviewed={reviewed} ply={ply} onPick={go} />
        </>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" aria-label="First move" onClick={() => go(0)} className="g-btn !min-h-[44px] !px-0 text-[16px]">
          ⏮
        </button>
        <button type="button" aria-label="Previous move" onClick={() => go(ply - 1)} className="g-btn !min-h-[44px] !px-0 text-[16px]">
          ◀
        </button>
        <button type="button" aria-label="Next move" onClick={() => go(ply + 1)} className="g-btn !min-h-[44px] !px-0 text-[16px]">
          ▶
        </button>
        <button type="button" aria-label="Last move" onClick={() => go(total)} className="g-btn !min-h-[44px] !px-0 text-[16px]">
          ⏭
        </button>
        <button type="button" aria-label="Flip board" onClick={() => setFlipped((f) => !f)} className="g-btn !min-h-[44px] !px-0 text-[16px]">
          ⇅
        </button>
      </div>

      {evals && (
        <div className="g-panel p-4">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-[13px]">
            <span />
            <span className="w-[64px] truncate text-center font-bold">{game.white}</span>
            <span className="w-[64px] truncate text-center font-bold">{game.black}</span>
            <span className="g-muted">Accuracy</span>
            <span className="rounded-md bg-[#f3ead8] py-1 text-center font-mono text-[16px] font-bold text-black">{accW ?? "—"}</span>
            <span className="rounded-md bg-[#2a2622] py-1 text-center font-mono text-[16px] font-bold ring-1 ring-white/10">{accB ?? "—"}</span>
            {ORDER.map((k) => (
              <div key={k} className="contents">
                <span className="flex items-center gap-2">
                  <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black text-white" style={{ background: KINDS[k].colour }}>
                    {KINDS[k].symbol}
                  </span>
                  {KINDS[k].label}
                </span>
                <span className="text-center font-mono font-bold" style={{ color: count("w", k) ? KINDS[k].colour : undefined }}>
                  {count("w", k)}
                </span>
                <span className="text-center font-mono font-bold" style={{ color: count("b", k) ? KINDS[k].colour : undefined }}>
                  {count("b", k)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ol className="g-panel grid grid-cols-[34px_1fr_1fr] gap-y-0.5 p-2 text-[14px]">
        {Array.from({ length: Math.ceil(total / 2) }, (_, n) => (
          <li key={n} className="contents">
            <span className="g-muted py-1 pl-1 font-mono text-[12px] leading-[22px]">{n + 1}.</span>
            {[0, 1].map((side) => {
              const i = n * 2 + side
              if (i >= total) return <span key={side} />
              const r = reviewed[i]
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => go(i + 1)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono ${ply === i + 1 ? "bg-[var(--g-panel-3)] text-white" : "hover:bg-[var(--g-panel-2)]"}`}
                >
                  {r && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-0.5 text-[9px] font-black text-white" style={{ background: KINDS[r.kind].colour }}>
                      {KINDS[r.kind].symbol}
                    </span>
                  )}
                  {sans[i]}
                </button>
              )
            })}
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <PlayLayout
      top={evalBar}
      bottom={
        <div className="flex h-[40px] items-center justify-between text-[13px] font-semibold">
          <span>
            {orientation === "white" ? game.white : game.black}
            {(orientation === "white" ? game.whiteRating : game.blackRating) ? <span className="g-muted"> ({orientation === "white" ? game.whiteRating : game.blackRating})</span> : null}
          </span>
          <span className="g-muted">
            vs {orientation === "white" ? game.black : game.white}
            {game.result ? ` · ${game.result}` : ""}
          </span>
        </div>
      }
      board={<Board id={`review-${game.key}`} fen={fen} orientation={orientation} movable={null} lastMove={cur ? { from: cur.from, to: cur.to } : null} arrows={arrows} marks={marks} overlay={badge} />}
      panel={panel}
    />
  )
}

// White's winning chances over the game. Tap to jump to a move.
function Graph({ reviewed, ply, onPick }: { reviewed: Reviewed[]; ply: number; onPick: (p: number) => void }) {
  const n = reviewed.length
  if (!n) return null
  const W = 300
  const H = 72
  const x = (i: number) => (i / Math.max(1, n)) * W
  const y = (w: number) => H - (w / 100) * H
  const pts = [`0,${y(50)}`, ...reviewed.map((r, i) => `${x(i + 1)},${y(r.winAfter)}`)]
  const area = `M0,${H} L${pts.join(" L")} L${W},${H} Z`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[72px] w-full cursor-pointer overflow-hidden rounded-xl bg-[#2a2622] ring-1 ring-white/10"
      role="img"
      aria-label="Evaluation over the game"
      onClick={(e) => {
        const b = e.currentTarget.getBoundingClientRect()
        onPick(Math.round(((e.clientX - b.left) / b.width) * n))
      }}
    >
      <path d={area} fill="#f3ead8" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(214,176,106,0.5)" strokeWidth="1" />
      {reviewed.map((r, i) =>
        r.kind === "blunder" || r.kind === "mistake" || r.kind === "brilliant" ? (
          <circle key={i} cx={x(i + 1)} cy={y(r.winAfter)} r="3.5" vectorEffect="non-scaling-stroke" fill={KINDS[r.kind].colour} stroke="#111" strokeWidth="1" />
        ) : null
      )}
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#5c8bb0" strokeWidth="2" />
    </svg>
  )
}
