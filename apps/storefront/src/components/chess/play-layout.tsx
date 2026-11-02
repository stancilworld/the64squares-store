"use client"

import { useEffect, useRef, useState } from "react"

const BARS = 2 * 52
const PANEL = 380
const GAP = 32

// Board with a player strip above and below, plus a side panel. The board is sized to fit
// the screen's height and width, so nothing needs scrolling while playing.
export function PlayLayout({
  top,
  board,
  bottom,
  panel,
}: {
  top: React.ReactNode
  board: React.ReactNode
  bottom: React.ReactNode
  panel: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ board: number; wide: boolean } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const wide = window.innerWidth >= 1024
      const width = el.clientWidth - (wide ? PANEL + GAP : 0)
      const offset = el.getBoundingClientRect().top + window.scrollY
      const height = window.innerHeight - offset - BARS - 16
      // On phones the width decides; on laptops the height usually does.
      const board = Math.floor(Math.max(280, Math.min(width, wide ? height : Math.max(height, width * 0.9), 900)))
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
  }, [])

  return (
    <div ref={ref} className="flex w-full flex-col items-center gap-5 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      <div style={{ width: size ? size.board : "100%" }} className={size ? "" : "max-w-[640px]"}>
        {top}
        {board}
        {bottom}
      </div>
      <aside
        className="flex w-full min-w-0 flex-col gap-3 lg:w-[380px] lg:shrink-0"
        style={size?.wide ? { height: size.board + BARS } : undefined}
      >
        {panel}
      </aside>
    </div>
  )
}
