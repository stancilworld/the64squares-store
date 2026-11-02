"use client"

import { useEffect, useRef } from "react"
import { BoardSettingsButton } from "./board-settings"

type Props = {
  moves: string[]
  // The position on show: -1 is the start, moves.length - 1 the latest.
  ply: number
  onGo: (ply: number) => void
  onFlip: () => void
  className?: string
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    <path d={d} />
  </svg>
)
const FIRST = "M6 5h2v14H6zm3.5 7L18 18V6z"
const PREV = "M15.5 5.5 9 12l6.5 6.5L17 17l-5-5 5-5z"
const NEXT = "M8.5 5.5 15 12l-6.5 6.5L7 17l5-5-5-5z"
const LAST = "M16 5h2v14h-2zM6 6v12l8.5-6z"
const FLIP = "M7 4 3 8h3v9h2V8h3zm10 16 4-4h-3V7h-2v9h-3z"

// The move list with buttons (and arrow keys) to step through the game. On phones the moves
// run in one line that scrolls sideways, so the page itself never jumps.
export function MovePanel({ moves, ply, onGo, onFlip, className = "" }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const last = moves.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return
      if (e.key === "ArrowLeft") onGo(Math.max(-1, ply - 1))
      else if (e.key === "ArrowRight") onGo(Math.min(last, ply + 1))
      else if (e.key === "ArrowUp" || e.key === "Home") onGo(-1)
      else if (e.key === "ArrowDown" || e.key === "End") onGo(last)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ply, last, onGo])

  // Keep the current move in view by scrolling only the list (never the page).
  useEffect(() => {
    const box = list.current
    const cur = box?.querySelector<HTMLElement>("[data-current='true']")
    if (box && cur) {
      const top = cur.offsetTop - box.offsetTop
      if (top < box.scrollTop) box.scrollTop = top
      else if (top + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + cur.offsetHeight - box.clientHeight
    }
    const row = strip.current
    const chip = row?.querySelector<HTMLElement>("[data-current='true']")
    if (row) row.scrollLeft = chip ? chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2 : 0
  }, [ply, moves.length])

  const rows: number[] = []
  for (let i = 0; i < moves.length; i += 2) rows.push(i)

  const btn =
    "flex h-[44px] flex-1 items-center justify-center rounded-lg bg-[var(--g-panel-2)] text-[var(--g-text)] transition hover:bg-[var(--g-panel-3)] active:translate-y-px disabled:opacity-30 disabled:hover:bg-[var(--g-panel-2)]"
  const cell = (i: number) =>
    i <= last ? (
      <button
        type="button"
        data-current={i === ply}
        onClick={() => onGo(i)}
        className={`rounded-md px-2 py-0.5 text-left ${i === ply ? "bg-[var(--g-panel-3)] font-bold text-white" : "hover:bg-[var(--g-panel-2)]"}`}
      >
        {moves[i]}
      </button>
    ) : (
      <span />
    )

  return (
    <div className={`g-panel flex min-h-0 flex-col overflow-hidden lg:flex-1 ${className}`}>
      {/* Phones: one sideways line of moves. */}
      <div ref={strip} className="flex h-[40px] items-center gap-1 overflow-x-auto whitespace-nowrap px-2 font-mono text-[14px] lg:hidden" style={{ scrollbarWidth: "none" }}>
        {moves.length ? (
          moves.map((m, i) => (
            <span key={i} className="flex items-center">
              {i % 2 === 0 && <span className="g-muted ml-1 mr-0.5 text-[12px]">{i / 2 + 1}.</span>}
              <button
                type="button"
                data-current={i === ply}
                onClick={() => onGo(i)}
                className={`rounded-md px-1.5 py-0.5 ${i === ply ? "bg-[var(--g-panel-3)] font-bold text-white" : ""}`}
              >
                {m}
              </button>
            </span>
          ))
        ) : (
          <span className="g-muted px-1 font-sans text-[13px]">No moves yet</span>
        )}
      </div>
      {/* Larger screens: the classic two-column list. */}
      <ol ref={list} className="hidden min-h-0 flex-1 overflow-y-auto px-2 py-2 font-mono text-[14px] lg:block">
        {rows.length ? (
          rows.map((i) => (
            <li key={i} className={`grid grid-cols-[40px_1fr_1fr] items-center gap-1 rounded-md py-[1px] ${(i / 2) % 2 ? "bg-white/[0.03]" : ""}`}>
              <span className="g-muted pl-2">{i / 2 + 1}.</span>
              {cell(i)}
              {cell(i + 1)}
            </li>
          ))
        ) : (
          <li className="g-muted px-2 py-1 font-sans text-[14px]">No moves yet.</li>
        )}
      </ol>
      <div className="flex gap-1.5 border-t border-[var(--g-line)] p-2">
        <button type="button" aria-label="First move" className={btn} disabled={ply < 0} onClick={() => onGo(-1)}>
          <Icon d={FIRST} />
        </button>
        <button type="button" aria-label="Previous move" className={btn} disabled={ply < 0} onClick={() => onGo(ply - 1)}>
          <Icon d={PREV} />
        </button>
        <button type="button" aria-label="Next move" className={btn} disabled={ply >= last} onClick={() => onGo(ply + 1)}>
          <Icon d={NEXT} />
        </button>
        <button type="button" aria-label="Latest move" className={btn} disabled={ply >= last} onClick={() => onGo(last)}>
          <Icon d={LAST} />
        </button>
        <button type="button" aria-label="Flip board" className={`${btn} max-w-[52px]`} onClick={onFlip}>
          <Icon d={FLIP} />
        </button>
        <BoardSettingsButton className={`${btn} max-w-[52px]`} />
      </div>
    </div>
  )
}
