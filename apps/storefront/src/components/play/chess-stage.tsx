"use client"

import Link from "next/link"
import { useRef } from "react"

// A small scene of pieces standing on a board, seen in perspective. The pointer moves the
// light and shifts the pieces by their depth (nearer pieces move more); the piece under the
// pointer lifts. Without a pointer (phones) it drifts slowly by itself; with reduced motion
// it stays still. The whole scene is a link to online play.

const PIECES = [
  // [art, left %, bottom %, height %, depth]
  ["bK", 21, 47, 44, 0.35],
  ["bQ", 39, 51, 37, 0.25],
  ["wR", 72, 31, 50, 0.65],
  ["wP", 4, 16, 38, 0.85],
  ["wN", 55, 12, 64, 1],
  ["wK", 27, 4, 78, 1.25],
] as const

export function ChessStage({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const frame = useRef(0)

  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 - 1
    const y = ((e.clientY - r.top) / r.height) * 2 - 1
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--mx", x.toFixed(3))
      el.style.setProperty("--my", y.toFixed(3))
    })
    el.dataset.live = "1"
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(frame.current)
    el.style.setProperty("--mx", "0")
    el.style.setProperty("--my", "0")
    delete el.dataset.live
  }

  return (
    <Link ref={ref} href={href} aria-label={label} className={`stage ${className}`} onPointerMove={move} onPointerLeave={leave}>
      <span className="stage-light" aria-hidden="true" />
      <span className="stage-scene" aria-hidden="true">
        <span className="stage-floor" />
        {PIECES.map(([art, left, bottom, height, depth]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={art}
            src={`/play-art/${art}.webp`}
            alt=""
            draggable={false}
            className="stage-piece"
            style={{ left: `${left}%`, bottom: `${bottom}%`, height: `${height}%`, zIndex: Math.round(depth * 10), ["--d" as string]: depth }}
          />
        ))}
      </span>
    </Link>
  )
}
