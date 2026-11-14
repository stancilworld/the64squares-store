"use client"

import { useEffect, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import { MiniBoard } from "@/components/tourney/mini-board"

// Live commentary for one game: viewers get a board that follows the game 25 seconds late
// with the lines in step; the two players get their own game's lines at once. It's read
// aloud by default (the ElevenLabs voice on featured games, the browser's voice otherwise),
// and anyone can mute it; the choice is remembered on this device.

type Side = { id: string; name: string; rating: number | null }
type MoveItem = { kind: "move"; ply: number; san: string; fen: string; from: string; to: string; clocks: { w: number; b: number } }
type LineItem = { kind: "line"; id: string; ply: number; moment: string; text: string; audio_url: string | null }
type EndItem = { kind: "end"; result: string | null; reason: string | null }
type Watch = { ok: true; live?: boolean; delay_ms: number; white: Side; black: Side; tc: string; tournament: string | null; voice: boolean; moves: MoveItem[]; lines: LineItem[]; end: EndItem | null }

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const KEY = "t64-commentary-listen"
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
const browserVoice = () => {
  const all = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : []
  return all.find((v) => v.lang === "en-IN") ?? all.find((v) => v.lang.startsWith("en-GB")) ?? all.find((v) => v.lang.startsWith("en")) ?? null
}

export function CommentaryPanel({ socket, gameId, showBoard = true }: { socket: Socket | null; gameId: string; showBoard?: boolean }) {
  const [w, setW] = useState<Watch | null>(null)
  const [state, setState] = useState<"loading" | "off" | "player" | "on">("loading")
  const [moves, setMoves] = useState<MoveItem[]>([])
  const [lines, setLines] = useState<LineItem[]>([])
  const [end, setEnd] = useState<EndItem | null>(null)
  const [listen, setListen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "off"
    } catch {
      return true
    }
  })
  const [blocked, setBlocked] = useState(false)
  const queue = useRef<LineItem[]>([])
  const playing = useRef(false)
  const listenRef = useRef(listen)
  const feed = useRef<HTMLOListElement>(null)

  // Says queued lines one after another.
  const next = useRef<() => void>(() => {})
  useEffect(() => {
    next.current = () => {
      if (playing.current || !listenRef.current) return
      const l = queue.current.shift()
      if (!l) return
      playing.current = true
      const done = () => {
        playing.current = false
        next.current()
      }
      if (l.audio_url) {
        const a = new Audio(l.audio_url)
        a.onended = done
        a.onerror = done
        void a.play().catch((e: Error) => {
          // The browser wants a tap on the page before it plays sound.
          if (e.name === "NotAllowedError") setBlocked(true)
          done()
        })
      } else if (typeof speechSynthesis !== "undefined") {
        const u = new SpeechSynthesisUtterance(l.text)
        const v = browserVoice()
        if (v) u.voice = v
        u.rate = 1.05
        u.onend = done
        u.onerror = done
        speechSynthesis.speak(u)
      } else done()
    }
  })

  useEffect(() => {
    if (!socket) return
    let alive = true
    const watch = () =>
      socket.emit("commentary:watch", gameId, (r: Watch | { ok: false; error: string }) => {
        if (!alive) return
        if (!r.ok) return setState(r.error === "player" ? "player" : "off")
        setW(r)
        setMoves(r.moves)
        setLines(r.lines)
        setEnd(r.end)
        setState("on")
      })
    if (socket.connected) watch()
    socket.on("connect", watch)
    const onItem = (it: (MoveItem | LineItem | EndItem) & { game_id: string }) => {
      if (it.game_id !== gameId) return
      if (it.kind === "move") setMoves((m) => (m.some((x) => x.ply === it.ply) ? m : [...m, it]))
      else if (it.kind === "line") {
        setLines((l) => [...l, it].slice(-120))
        if (listenRef.current) {
          queue.current.push(it)
          next.current()
        }
      } else setEnd(it)
    }
    const onStart = (d: { game_id: string }) => d.game_id === gameId && watch()
    const onOff = (d: { game_id: string }) => d.game_id === gameId && setState("off")
    socket.on("commentary:item", onItem)
    socket.on("commentary:started", onStart)
    socket.on("commentary:off", onOff)
    return () => {
      alive = false
      socket.emit("commentary:unwatch", gameId)
      socket.off("connect", watch)
      socket.off("commentary:item", onItem)
      socket.off("commentary:started", onStart)
      socket.off("commentary:off", onOff)
    }
  }, [socket, gameId])

  useEffect(() => {
    const el = feed.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  useEffect(
    () => () => {
      listenRef.current = false
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
    },
    []
  )

  const toggle = () => {
    const on = blocked ? true : !listen
    setBlocked(false)
    setListen(on)
    listenRef.current = on
    try {
      localStorage.setItem(KEY, on ? "on" : "off")
    } catch {}
    if (on) {
      // Start with the latest line so the voice is in step with the board.
      queue.current = lines.slice(-1)
      next.current()
    } else {
      queue.current = []
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
    }
  }

  if (state === "loading") return null
  if (state === "off" || !w) return null
  const last = moves.at(-1)
  const lastLine = lines.at(-1)
  const turn = last ? (last.ply % 2 === 1 ? "b" : "w") : "w"

  return (
    <section className="commentary" aria-label="Live commentary">
      <header className="commentary-head">
        <span className="commentary-live">
          <span className="lobby-dot lobby-dot-live" aria-hidden="true" /> Commentary
        </span>
        <span className="commentary-delay">{w.live ? "Your game, live" : `${Math.round(w.delay_ms / 1000)} s behind the game`}</span>
        <button type="button" className="commentary-listen" aria-pressed={listen && !blocked} aria-label={listen && !blocked ? "Mute the commentary" : "Turn the commentary sound on"} onClick={toggle}>
          {blocked ? "Tap to listen" : listen ? "🔊 Mute" : "🔇 Unmute"}
        </button>
      </header>
      {showBoard && (
        <div className="commentary-board">
          <p className="commentary-side">
            <span>
              {w.black.name}
              {w.black.rating ? ` (${w.black.rating})` : ""}
            </span>
            {last && <span className={`commentary-clock ${turn === "b" && !end ? "commentary-clock-on" : ""}`}>{clock(last.clocks.b)}</span>}
          </p>
          <MiniBoard fen={last?.fen ?? START} lastMove={last ? { from: last.from, to: last.to } : null} label={`Position after ${last?.san ?? "the start"}`} />
          <p className="commentary-side">
            <span>
              {w.white.name}
              {w.white.rating ? ` (${w.white.rating})` : ""}
            </span>
            {last && <span className={`commentary-clock ${turn === "w" && !end ? "commentary-clock-on" : ""}`}>{clock(last.clocks.w)}</span>}
          </p>
        </div>
      )}
      {lastLine && <p className="commentary-now">{lastLine.text}</p>}
      <ol ref={feed} className="commentary-feed" aria-live="polite">
        {lines.slice(0, -1).map((l) => (
          <li key={l.id}>
            <span className="commentary-move">{Math.ceil(l.ply / 2)}.</span> {l.text}
          </li>
        ))}
        {lines.length === 0 && <li className="opacity-70">The commentator is watching. The first words come with the first moves.</li>}
      </ol>
      {end && <p className="commentary-end">Game over: {end.result === "1/2-1/2" ? "draw" : end.result === "1-0" ? `${w.white.name} won` : end.result === "0-1" ? `${w.black.name} won` : "finished"}</p>}
    </section>
  )
}
