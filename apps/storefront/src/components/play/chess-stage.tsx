"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { startClash } from "./clash-fx"
import { CLASH } from "./clash-layout"

// The "Play online" scene: pieces thrown into the air by a clash on the board, in smoke and
// embers. A rendered backdrop and the flying pieces as separate layers (tools/pieces/
// render-clash.py), with the smoke, embers and movement drawn live (clash-fx.ts). The pointer
// tilts it and the pieces lean away from it; pressing sets off a burst on the way to the game.
// With reduced motion it is a still picture. The whole scene is a link to online play.

const ART = "/play-art/clash"

export function ChessStage({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  const root = useRef<HTMLAnchorElement>(null)
  const frame = useRef<HTMLSpanElement>(null)
  const plate = useRef<HTMLImageElement>(null)
  const back = useRef<HTMLCanvasElement>(null)
  const front = useRef<HTMLCanvasElement>(null)
  const pieces = useRef<(HTMLImageElement | null)[]>([])

  useEffect(() => {
    if (!root.current || !frame.current || !plate.current || !back.current || !front.current) return
    return startClash(
      { root: root.current, frame: frame.current, plate: plate.current, back: back.current, front: front.current, pieces: pieces.current },
      CLASH.pieces,
      CLASH.clash
    )
  }, [])

  return (
    <Link ref={root} href={href} aria-label={label} className={`clash ${className}`}>
      <span ref={frame} className="clash-frame" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={plate}
          src={`${ART}/plate.webp`}
          srcSet={`${ART}/plate-900.webp 900w, ${ART}/plate.webp 1800w`}
          sizes="(min-width: 640px) 760px, 100vw"
          alt=""
          draggable={false}
          fetchPriority="high"
          className="clash-plate"
        />
        <canvas ref={back} className="clash-fx" />
        {CLASH.pieces.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.name}
            ref={(el) => {
              pieces.current[i] = el
            }}
            src={`${ART}/${p.name}.webp`}
            alt=""
            draggable={false}
            className="clash-piece"
            style={{ left: `${p.l * 100}%`, top: `${p.t * 100}%`, width: `${(p.r - p.l) * 100}%` }}
          />
        ))}
        <canvas ref={front} className="clash-fx" />
      </span>
    </Link>
  )
}
