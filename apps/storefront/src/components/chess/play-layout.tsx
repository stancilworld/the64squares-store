"use client"

import { useEffect, useRef, useState } from "react"
import { useFocus } from "@/lib/chess/focus"

const BARS = 2 * 52
const PANEL = 380
const TOOLS = 96
const GAP = 32

// Board with a player strip above and below, a tool column on its left (desktop) and a side
// panel. The board is sized to fit the screen's height and width, so nothing needs scrolling
// while playing. In focus mode the side panel goes and the board grows.
export function PlayLayout({
  top,
  board,
  bottom,
  panel,
  tools,
  boardOnPhones = true,
}: {
  boardOnPhones?: boolean
  top: React.ReactNode
  board: React.ReactNode
  bottom: React.ReactNode
  panel: React.ReactNode
  tools?: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const focus = useFocus()
  const [size, setSize] = useState<{ board: number; wide: boolean } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const wide = window.innerWidth >= 1024
      const side = wide ? (focus ? 2 * (TOOLS + GAP) : PANEL + GAP + (tools ? TOOLS + GAP : 0)) : 0
      const width = el.clientWidth - side
      const offset = el.getBoundingClientRect().top + window.scrollY
      const height = window.innerHeight - offset - BARS - (wide ? 16 : tools ? 72 : 16)
      // On phones the width decides; on laptops the height usually does.
      const board = Math.floor(Math.max(280, Math.min(width, wide ? height : Math.max(height, width * 0.9), focus ? 1100 : 900)))
      setSize((s) => (s && s.board === board && s.wide === wide ? s : { board, wide }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [focus, tools])

  return (
    <div ref={ref} className="flex w-full flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      {tools && (
        // Desktop: a column of tools beside the board, level with its middle.
        <div className="hidden w-[96px] shrink-0 flex-col items-center gap-5 self-center lg:flex">{tools}</div>
      )}
      <div style={{ width: size ? size.board : "100%" }} className={`${size ? "" : "max-w-[640px]"} ${boardOnPhones ? "" : "hidden lg:block"}`}>
        {top}
        {board}
        {bottom}
        {tools && <div className="mt-3 flex justify-center gap-6 lg:hidden">{tools}</div>}
      </div>
      <aside
        className={`flex w-full min-w-0 flex-col gap-3 lg:w-[380px] lg:shrink-0 ${focus ? "hidden" : ""}`}
        style={size?.wide ? { height: size.board + BARS } : undefined}
      >
        {panel}
      </aside>
      {/* Keeps the board centred in focus mode. */}
      {focus && tools && <div className="hidden w-[96px] shrink-0 lg:block" aria-hidden="true" />}
    </div>
  )
}

// One tool beside the board: an icon with a short label (and its key, if it has one).
export function BoardTool({ icon, label, keyHint, onClick, active = false }: { icon: React.ReactNode; label: string; keyHint?: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1.5 text-[12px] font-medium transition hover:text-white ${active ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}
    >
      {icon}
      <span className="flex items-center gap-1 whitespace-nowrap">
        {label}
        {keyHint && <kbd className="hidden rounded-[3px] border border-current px-1 font-sans text-[10px] leading-[14px] lg:inline">{keyHint}</kbd>}
      </span>
    </button>
  )
}
