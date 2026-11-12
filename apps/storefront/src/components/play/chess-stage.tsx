"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { SceneHandle } from "./clash-scene"

// The "Play online" scene: pieces thrown up by a clash on the board, in smoke, sparks and amber
// light, live in 3D (clash-scene.ts). It turns slowly round the board; the pointer tilts it,
// dragging spins it, pressing sets off a burst on the way to the game. A picture of it shows
// until the 3D has loaded (and stays if WebGL isn't available).

export function ChessStage({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  const root = useRef<HTMLAnchorElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<SceneHandle | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let gone = false
    const el = root.current
    const cv = canvas.current
    if (!el || !cv) return
    import("./clash-scene")
      .then((m) => m.startClashScene(cv, el, () => !gone && setReady(true)))
      .then((h) => {
        if (gone) h.stop()
        else scene.current = h
      })
      .catch(() => {}) // No WebGL: the picture stays.
    return () => {
      gone = true
      scene.current?.stop()
      scene.current = null
    }
  }, [])

  return (
    <Link
      ref={root}
      href={href}
      aria-label={label}
      className={`clash ${className}`}
      // A drag spins the scene; only a press without one opens the game.
      onClick={(e) => scene.current?.dragged() && e.preventDefault()}
      draggable={false}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/play-art/clash-poster.webp" alt="" draggable={false} fetchPriority="high" className="clash-poster" />
      <canvas ref={canvas} className="clash-canvas" data-ready={ready || undefined} aria-hidden="true" />
    </Link>
  )
}
