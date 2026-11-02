import Image from "next/image"
import { LoopingVideo } from "./looping-video"

// Everything uploaded in the admin can be a picture, an animated GIF/WebP or a video.
// Videos (MP4, WebM, MOV) play silently on a loop like a GIF; GIFs skip image
// optimisation so they keep animating; other pictures go through next/image.
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i
const GIF = /\.gif(\?|#|$)/i

export const isVideo = (src: string) => VIDEO.test(src)

// Plain element sized by its className (used where the box size comes from CSS).
export function Media({ src, className = "", alt = "" }: { src: string; className?: string; alt?: string }) {
  if (isVideo(src)) {
    return <LoopingVideo src={src} className={className} />
  }
  // eslint-disable-next-line @next/next/no-img-element -- uploaded GIFs and SVGs must not be re-encoded
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />
}

// Fills its positioned parent (like next/image "fill"), cropping to cover by default.
export function FillMedia({
  src,
  sizes,
  alt = "",
  priority = false,
  className = "object-cover",
}: {
  src: string
  sizes: string
  alt?: string
  priority?: boolean
  className?: string
}) {
  const box = `absolute inset-0 h-full w-full ${className}`
  if (isVideo(src)) {
    return <LoopingVideo src={src} className={box} />
  }
  if (GIF.test(src) || src.endsWith(".svg")) {
    // eslint-disable-next-line @next/next/no-img-element -- keep animation / vector
    return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={box} />
  }
  return <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className={className} />
}
