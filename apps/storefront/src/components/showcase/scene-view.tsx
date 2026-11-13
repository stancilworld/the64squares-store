"use client"

import { useEffect, useRef, useState } from "react"
import type { SceneHandle } from "./clash-scene"

// The website's 3D designs, by key (the admin's library lists the same keys: backend
// lib/showcase.ts SCENES). Each loads its code only when shown, and shows a picture of
// itself until then (and instead, with reduced motion handled by the design itself, or
// without WebGL).

type Start = (canvas: HTMLCanvasElement, root: HTMLElement, onReady: () => void) => Promise<SceneHandle>

export const SCENES: Record<string, { poster: string; load: () => Promise<Start> }> = {
  clash: { poster: "/play-art/clash-poster.webp", load: () => import("./clash-scene").then((m) => m.startClashScene) },
}

export function SceneView({ scene, className = "" }: { scene: string; className?: string }) {
  const def = SCENES[scene] ?? SCENES.clash
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let gone = false
    let handle: SceneHandle | null = null
    const el = root.current
    const cv = canvas.current
    if (!el || !cv) return
    def
      .load()
      .then((start) => start(cv, el, () => !gone && setReady(true)))
      .then((h) => {
        if (gone) h.stop()
        else handle = h
      })
      .catch(() => {}) // No WebGL: the picture stays.
    return () => {
      gone = true
      handle?.stop()
    }
  }, [def])

  return (
    <div ref={root} className={`clash ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={def.poster} alt="" draggable={false} className="clash-poster" />
      <canvas ref={canvas} className="clash-canvas" data-ready={ready || undefined} />
    </div>
  )
}
