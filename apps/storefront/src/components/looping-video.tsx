"use client"

import { useEffect, useRef } from "react"

// A silent looping video that behaves like a GIF. Some browsers ignore the autoplay
// attribute on server-rendered videos, so playback is also started once mounted.
export function LoopingVideo({ src, className = "" }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) {
      return
    }
    video.muted = true
    video.play().catch(() => {
      // Autoplay refused (e.g. data saver); the first frame stays visible.
    })
  }, [src])

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      className={className}
    />
  )
}
