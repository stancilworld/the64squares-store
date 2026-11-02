"use client"

import { useEffect, useRef } from "react"
import { BoardSettingsButton } from "./board-settings"

type Props = {
  moves: string[]
  // The position on show: -1 is the start, moves.length - 1 the latest.
  ply: number
  onGo: (ply: number) => void
  onFlip: () => void
  footer?: React.ReactNode
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

// The move list with buttons (and arrow keys) to step through the game.
export function MovePanel({ moves, ply, onGo, onFlip, footer }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const last = moves.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
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

  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>("[data-current='true']")
    el?.scrollIntoView({ block: "nearest" })
  }, [ply, moves.length])

  const rows: number[] = []
  for (let i = 0; i < moves.length; i += 2) rows.push(i)

  const btn =
    "flex h-[44px] flex-1 items-center justify-center rounded-md bg-[#efede9] text-[#3b3835] transition hover:bg-[#e2dfda] disabled:opacity-35 disabled:hover:bg-[#efede9]"
  const cell = (i: number) =>
    i <= last ? (
      <button
        type="button"
        data-current={i === ply}
        onClick={() => onGo(i)}
        className={`rounded px-2 py-0.5 text-left ${i === ply ? "bg-[#dcd8d1] font-semibold" : "hover:bg-[#efede9]"}`}
      >
        {moves[i]}
      </button>
    ) : (
      <span />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-rule bg-white">
      <ol ref={list} className="min-h-[120px] flex-1 overflow-y-auto px-2 py-2 font-mono text-[14px] lg:min-h-0">
        {rows.length ? (
          rows.map((i) => (
            <li key={i} className={`grid grid-cols-[40px_1fr_1fr] items-center gap-1 rounded py-[1px] ${(i / 2) % 2 ? "bg-[#faf9f7]" : ""}`}>
              <span className="pl-2 text-muted">{i / 2 + 1}.</span>
              {cell(i)}
              {cell(i + 1)}
            </li>
          ))
        ) : (
          <li className="px-2 py-1 font-sans text-[14px] text-muted">No moves yet.</li>
        )}
      </ol>
      <div className="flex gap-1.5 border-t border-rule p-2">
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
        <button type="button" aria-label="Flip board" className={`${btn} max-w-[48px]`} onClick={onFlip}>
          <Icon d={FLIP} />
        </button>
        <BoardSettingsButton className={`${btn} max-w-[48px]`} />
      </div>
      {footer && <div className="border-t border-rule p-3">{footer}</div>}
    </div>
  )
}
