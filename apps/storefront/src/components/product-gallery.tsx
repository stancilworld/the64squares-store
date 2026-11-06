"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { VARIANT_SELECTED } from "@/lib/product-events"

type Img = { id: string; url: string }

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

const Arrow = ({ dir, onClick, className = "" }: { dir: "prev" | "next"; onClick: () => void; className?: string }) => (
  <button
    type="button"
    aria-label={dir === "prev" ? "Previous photo" : "Next photo"}
    onClick={(e) => {
      e.stopPropagation()
      onClick()
    }}
    className={`absolute top-1/2 z-10 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-opacity hover:bg-white ${
      dir === "prev" ? "left-3 lg:left-4" : "right-3 lg:right-4"
    } ${className}`}
  >
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
)

// A swipeable row of photos that snaps one photo at a time. Reports which photo is showing.
function Track({
  images,
  index,
  onIndex,
  render,
  className = "",
}: {
  images: Img[]
  index: number
  onIndex: (i: number) => void
  render: (img: Img, i: number) => React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settling = useRef(false)

  // Move to `index` when it changes from outside (thumbnails, arrows, colour choice).
  useEffect(() => {
    const el = ref.current
    if (!el || !el.clientWidth) {
      return
    }
    const current = Math.round(el.scrollLeft / el.clientWidth)
    if (current !== index) {
      settling.current = true
      el.scrollTo({ left: index * el.clientWidth, behavior: reduceMotion() ? "auto" : "smooth" })
    }
  }, [index])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        const i = Math.round(el.scrollLeft / el.clientWidth)
        if (Math.abs(el.scrollLeft - i * el.clientWidth) < 2) {
          settling.current = false
          if (i !== index) {
            onIndex(i)
          }
        } else if (!settling.current && i !== index) {
          // Swiping by hand: follow the photo under the finger.
          onIndex(i)
        }
      }}
      className={`flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {images.map((img, i) => (
        <div key={img.id} className="relative h-full w-full shrink-0 snap-center snap-always">
          {render(img, i)}
        </div>
      ))}
    </div>
  )
}

// Full-screen photo viewer: arrows, swipe, keyboard, thumbnails and click-to-zoom.
function Viewer({
  images,
  title,
  start,
  onClose,
}: {
  images: Img[]
  title: string
  start: number
  onClose: (index: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(start)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const count = images.length
  const go = useCallback((i: number) => {
    setZoom(null)
    setIndex((i + count) % count)
  }, [count])

  useEffect(() => {
    const d = dialog.current
    d?.showModal()
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = before
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1)
      if (e.key === "ArrowLeft") go(index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, go])

  const origin = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  return (
    <dialog
      ref={dialog}
      aria-label={`${title} photos`}
      onClose={() => onClose(index)}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-white p-0 backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-5 py-4 lg:px-8">
          <p className="text-[15px] text-black/60">
            {index + 1} / {count}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full hover:bg-linen"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <Track
            images={images}
            index={index}
            onIndex={(i) => {
              setZoom(null)
              setIndex(i)
            }}
            className={zoom ? "overflow-x-hidden" : ""}
            render={(img, i) => (
              <div
                className={`relative h-full w-full overflow-hidden ${
                  i === index && zoom ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
                onClick={(e) => setZoom(i === index && zoom ? null : origin(e))}
                onMouseMove={(e) => i === index && zoom && setZoom(origin(e))}
              >
                <Image
                  src={img.url}
                  alt={`${title}, photo ${i + 1} of ${count}`}
                  fill
                  sizes="100vw"
                  quality={90}
                  className="object-contain transition-transform duration-200 ease-out"
                  style={
                    i === index && zoom
                      ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` }
                      : undefined
                  }
                />
              </div>
            )}
          />
          {count > 1 && (
            <>
              <Arrow dir="prev" onClick={() => go(index - 1)} />
              <Arrow dir="next" onClick={() => go(index + 1)} />
            </>
          )}
        </div>
        {count > 1 && (
          <div className="flex justify-center gap-3 overflow-x-auto px-5 py-4 [scrollbar-width:none]">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-md bg-placeholder ${
                  i === index ? "ring-2 ring-ink ring-offset-2" : "opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  )
}

/**
 * Product photos: one large photo with small ones below.
 * - Hover a small photo to preview it large; moving away shows the chosen photo again.
 * - Click a small photo to choose it. Arrows, swiping and the keyboard move between photos.
 * - Click the large photo to open the full-screen viewer (with zoom).
 * - Choosing a colour shows that colour's photos when they are linked to it in the admin.
 */
export function ProductGallery({
  images,
  title,
  variantImages = {},
  overlay,
}: {
  images: Img[]
  title: string
  variantImages?: Record<string, string[]>
  // Shown over the main photo's corner (the wishlist heart).
  overlay?: React.ReactNode
}) {
  const [selected, setSelected] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)
  const [viewer, setViewer] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const count = images.length

  // Show the first photo linked to the chosen colour/variant. Medusa also lists photos that
  // aren't tied to any variant under every variant, so those shared photos are skipped.
  useEffect(() => {
    const lists = Object.values(variantImages)
    const shared = new Set(
      lists.length > 1 ? images.filter((img) => lists.every((l) => l.includes(img.id))).map((img) => img.id) : []
    )
    const onVariant = (e: Event) => {
      const ids = variantImages[(e as CustomEvent<string>).detail] ?? []
      const i = images.findIndex((img) => ids.includes(img.id) && !shared.has(img.id))
      if (i >= 0) {
        setSelected(i)
      }
    }
    window.addEventListener(VARIANT_SELECTED, onVariant)
    return () => window.removeEventListener(VARIANT_SELECTED, onVariant)
  }, [images, variantImages])

  // Keep the chosen small photo visible in the strip.
  useEffect(() => {
    const thumb = strip.current?.children[selected] as HTMLElement | undefined
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion() ? "auto" : "smooth" })
  }, [selected])

  if (!count) {
    return <div className="relative aspect-square overflow-hidden rounded-md bg-placeholder">{overlay}</div>
  }

  const go = (i: number) => setSelected((i + count) % count)
  const shown = preview ?? selected

  return (
    <div className="grid min-w-0 gap-4">
      <div
        className="group relative aspect-square overflow-hidden rounded-md bg-placeholder"
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title} photos`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(selected + 1)
          if (e.key === "ArrowLeft") go(selected - 1)
          if (e.key === "Enter") setViewer(true)
        }}
      >
        {overlay}
        <Track
          images={images}
          index={selected}
          onIndex={setSelected}
          render={(img, i) => (
            <button
              type="button"
              aria-label={`Open photo ${i + 1} of ${count} full screen`}
              onClick={() => setViewer(true)}
              className="relative block h-full w-full cursor-zoom-in"
            >
              <Image
                src={img.url}
                alt={i === 0 ? title : `${title}, photo ${i + 1}`}
                fill
                priority={i === 0}
                loading={i === 0 ? undefined : "eager"}
                sizes="(min-width: 1024px) 680px, 100vw"
                className="object-cover"
              />
            </button>
          )}
        />
        {/* Hover preview from the small photos, shown over the chosen photo. */}
        {preview !== null && preview !== selected && (
          <div className="pointer-events-none absolute inset-0 z-[5] bg-placeholder">
            <Image
              src={images[preview].url}
              alt=""
              fill
              sizes="(min-width: 1024px) 680px, 100vw"
              className="object-cover"
            />
          </div>
        )}
        {count > 1 && (
          <>
            <Arrow dir="prev" onClick={() => go(selected - 1)} className="lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100" />
            <Arrow dir="next" onClick={() => go(selected + 1)} className="lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100" />
            <p className="pointer-events-none absolute bottom-4 right-5 z-10 rounded-full bg-white/90 px-3 py-1 text-[13px] lg:bottom-5 lg:right-6">
              {shown + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <div
          ref={strip}
          className="flex gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onMouseLeave={() => setPreview(null)}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === selected}
              onMouseEnter={() => setPreview(i)}
              onFocus={() => setPreview(i)}
              onBlur={() => setPreview(null)}
              onClick={() => {
                setSelected(i)
                setPreview(null)
              }}
              className="relative aspect-square shrink-0 basis-[calc((100%-48px)/4)] overflow-hidden rounded-md bg-placeholder transition-opacity hover:opacity-90"
            >
              <Image src={img.url} alt="" fill sizes="160px" className="object-cover" />
              {i === selected && (
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-ink" />
              )}
            </button>
          ))}
        </div>
      )}

      {viewer && (
        <Viewer
          images={images}
          title={title}
          start={selected}
          onClose={(i) => {
            setViewer(false)
            setSelected(i)
          }}
        />
      )}
    </div>
  )
}
