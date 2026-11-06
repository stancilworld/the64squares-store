import { Button, Text } from "@medusajs/ui"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { BACKEND_URL } from "./sdk"

// Crop window for product photos: a fixed square frame over the photo. Drag to move, zoom
// with the slider, the mouse wheel or two fingers. Zooming out past the edges fits more
// of the photo and fills the empty space white (transparent for PNGs).
// Several photos are cropped one after another; each can also be kept in its original shape.

// Longest side of the cropped square sent for upload (the server stores at most 2000 px).
const OUTPUT_MAX = 2000
// How far in you can zoom, as a multiple of "fill the square".
const MAX_ZOOM = 5

type Loaded = { url: string; w: number; h: number; revoke: boolean }
type View = { s: number; x: number; y: number }

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b))

// Asks the server for a version the browser can show (HEIC photos on Chrome and Windows).
const serverPreview = async (file: File): Promise<string> => {
  const base = BACKEND_URL === "/" ? "" : BACKEND_URL
  const res = await fetch(`${base}/admin/image-preview?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message || "This photo couldn't be opened.")
  }
  return URL.createObjectURL(await res.blob())
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("unreadable"))
    img.src = url
  })

const baseName = (name: string) => name.replace(/\.[^./\\]+$/, "") || "photo"

type Props = {
  files: File[]
  // Called once with every photo: cropped squares, or originals the user chose to keep.
  onDone: (files: File[]) => void
  onCancel: () => void
}

export function PhotoCropper({ files, onDone, onCancel }: Props) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  const [size, setSize] = useState(420)
  const [saving, setSaving] = useState(false)
  const results = useRef<File[]>([])
  const imgEl = useRef<HTMLImageElement | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const file = files[index]
  // PNGs keep see-through areas; everything else gets a white background.
  const png = /png$/i.test(file.type) || /\.png$/i.test(file.name)

  // Square size: fits the window, at most 440 px.
  useLayoutEffect(() => {
    const fit = () => setSize(Math.max(220, Math.min(440, window.innerWidth - 64, window.innerHeight - 300)))
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])

  // Opens the current photo: in the browser if it can, otherwise through the server.
  useEffect(() => {
    let cancelled = false
    let made: Loaded | null = null
    setLoaded(null)
    setError(null)
    ;(async () => {
      const local = URL.createObjectURL(file)
      try {
        const img = await loadImage(local)
        made = { url: local, w: img.naturalWidth, h: img.naturalHeight, revoke: true }
        imgEl.current = img
      } catch {
        URL.revokeObjectURL(local)
        try {
          const url = await serverPreview(file)
          const img = await loadImage(url)
          made = { url, w: img.naturalWidth, h: img.naturalHeight, revoke: true }
          imgEl.current = img
        } catch (e) {
          if (!cancelled) setError((e as Error).message === "unreadable" ? "This photo couldn't be opened." : (e as Error).message)
          return
        }
      }
      if (cancelled) {
        URL.revokeObjectURL(made.url)
        return
      }
      setLoaded(made)
    })()
    return () => {
      cancelled = true
      if (made?.revoke) URL.revokeObjectURL(made.url)
    }
  }, [file])

  const limits = useCallback(
    (l: Loaded) => {
      const fill = size / Math.min(l.w, l.h)
      const whole = size / Math.max(l.w, l.h)
      return { fill, whole, max: fill * MAX_ZOOM }
    },
    [size]
  )

  // Keeps the photo from sliding away: it always covers the frame where it can, and stays
  // inside it where it's smaller.
  const settle = useCallback(
    (v: View, l: Loaded): View => {
      const { whole, max } = limits(l)
      const s = clamp(v.s, whole, max)
      const dw = l.w * s
      const dh = l.h * s
      return {
        s,
        x: dw >= size ? clamp(v.x, size - dw, 0) : clamp(v.x, 0, size - dw),
        y: dh >= size ? clamp(v.y, size - dh, 0) : clamp(v.y, 0, size - dh),
      }
    },
    [limits, size]
  )

  const centred = useCallback(
    (s: number, l: Loaded): View => settle({ s, x: (size - l.w * s) / 2, y: (size - l.h * s) / 2 }, l),
    [settle, size]
  )

  // Starts each photo filling the square, centred.
  useEffect(() => {
    if (loaded) setView(centred(limits(loaded).fill, loaded))
  }, [loaded, centred, limits])

  // Zooms to scale s, keeping the point (px, py) of the frame still.
  const zoomTo = useCallback(
    (s: number, px = size / 2, py = size / 2) => {
      if (!loaded) return
      setView((v) => {
        const next = clamp(s, limits(loaded).whole, limits(loaded).max)
        const k = next / v.s
        return settle({ s: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, loaded)
      })
    },
    [loaded, limits, settle, size]
  )

  // Mouse wheel (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const el = frame.current
    if (!el || !loaded) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left - PAD
      const py = e.clientY - r.top - PAD
      setView((v) => {
        const next = clamp(v.s * Math.exp(-e.deltaY * 0.0015), limits(loaded).whole, limits(loaded).max)
        const k = next / v.s
        return settle({ s: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, loaded)
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [loaded, limits, settle])

  // Dragging with one pointer, pinching with two.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; s: number; mx: number; my: number; vx: number; vy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = null
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current
    const prev = p.get(e.pointerId)
    if (!prev || !loaded) return
    p.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (p.size === 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      setView((v) => settle({ ...v, x: v.x + dx, y: v.y + dy }, loaded))
      return
    }
    const [a, b] = [...p.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const r = frame.current!.getBoundingClientRect()
    const mx = (a.x + b.x) / 2 - r.left - PAD
    const my = (a.y + b.y) / 2 - r.top - PAD
    setView((v) => {
      if (!gesture.current) gesture.current = { dist, s: v.s, mx, my, vx: v.x, vy: v.y }
      const g = gesture.current
      const next = clamp((g.s * dist) / g.dist, limits(loaded).whole, limits(loaded).max)
      const k = next / g.s
      return settle({ s: next, x: mx - (g.mx - g.vx) * k, y: my - (g.my - g.vy) * k }, loaded)
    })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    gesture.current = null
  }

  const advance = (out: File | null) => {
    if (out) results.current.push(out)
    if (index + 1 < files.length) {
      setIndex(index + 1)
    } else {
      onDone(results.current)
    }
  }

  // Draws the square as it is shown, at full resolution, and moves on.
  const cropAndNext = async () => {
    const img = imgEl.current
    if (!loaded || !img) return
    setSaving(true)
    try {
      const side = size / view.s
      const n = Math.max(1, Math.round(Math.min(OUTPUT_MAX, side)))
      const k = n / size
      const canvas = document.createElement("canvas")
      canvas.width = n
      canvas.height = n
      const ctx = canvas.getContext("2d")!
      if (!png) {
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, n, n)
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, view.x * k, view.y * k, loaded.w * view.s * k, loaded.h * view.s * k)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, png ? "image/png" : "image/jpeg", 0.92))
      if (!blob) throw new Error("The square couldn't be made.")
      advance(new File([blob], `${baseName(file.name)}.${png ? "png" : "jpg"}`, { type: blob.type }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Keyboard: arrows move, + and - zoom, Enter uses the square, Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (!loaded || (e.target as HTMLElement)?.tagName === "INPUT") return
      const step = e.shiftKey ? 40 : 10
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }
      if (moves[e.key]) {
        e.preventDefault()
        const [dx, dy] = moves[e.key]
        setView((v) => settle({ ...v, x: v.x + dx, y: v.y + dy }, loaded))
      } else if (e.key === "+" || e.key === "=") {
        zoomTo(view.s * 1.15)
      } else if (e.key === "-") {
        zoomTo(view.s / 1.15)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [loaded, onCancel, settle, view.s, zoomTo])

  const lim = loaded ? limits(loaded) : null
  // Slider position on a log scale between "whole photo" and the closest zoom.
  const t = lim ? Math.log(view.s / lim.whole) / Math.log(lim.max / lim.whole) : 0
  const fromT = (v: number) => (lim ? lim.whole * Math.pow(lim.max / lim.whole, v) : 1)
  const sourcePx = loaded ? Math.round(size / view.s) : 0
  const small = loaded && sourcePx < 800
  const gaps = loaded && (loaded.w * view.s < size - 0.5 || loaded.h * view.s < size - 0.5)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose the square part of the photo"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex max-h-full w-fit max-w-full flex-col overflow-auto rounded-xl bg-ui-bg-base shadow-elevation-modal">
        <div className="flex items-baseline justify-between gap-4 border-b border-ui-border-base px-5 py-3">
          <div className="min-w-0">
            <Text weight="plus">Choose the square part</Text>
            <Text size="xsmall" className="truncate text-ui-fg-subtle">{file.name}</Text>
          </div>
          {files.length > 1 && (
            <Text size="small" className="shrink-0 text-ui-fg-subtle">
              Photo {index + 1} of {files.length}
            </Text>
          )}
        </div>

        <div className="px-5 pt-4">
          <div
            ref={frame}
            className={`relative touch-none select-none overflow-hidden rounded-lg ${
              png ? "bg-[repeating-conic-gradient(#e5e7eb_0_25%,#f9fafb_0_50%)] bg-[length:16px_16px]" : "bg-white"
            }`}
            style={{ width: size + PAD * 2, height: size + PAD * 2, cursor: loaded ? "grab" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => loaded && setView(centred(limits(loaded).fill, loaded))}
          >
            {loaded && (
              <img
                src={loaded.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: PAD + view.x,
                  top: PAD + view.y,
                  width: loaded.w * view.s,
                  height: loaded.h * view.s,
                }}
              />
            )}
            {/* The square: everything outside it is dimmed. */}
            <div
              className="pointer-events-none absolute rounded-[2px] outline outline-2 outline-white"
              style={{ left: PAD, top: PAD, width: size, height: size, boxShadow: "0 0 0 9999px rgba(17,24,39,0.6)" }}
            >
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
            </div>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <Text size="small" className={error ? "text-ui-fg-error" : "text-white"}>
                  {error ?? "Opening photo…"}
                </Text>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              aria-label="Zoom out"
              className="rounded p-1 text-lg leading-none text-ui-fg-subtle hover:bg-ui-bg-base-hover disabled:opacity-40"
              disabled={!lim}
              onClick={() => zoomTo(view.s / 1.2)}
            >
              −
            </button>
            <input
              type="range"
              aria-label="Zoom"
              min={0}
              max={1000}
              value={Math.round(t * 1000)}
              disabled={!lim}
              onChange={(e) => zoomTo(fromT(Number(e.target.value) / 1000))}
              className="min-w-0 flex-1 accent-ui-fg-interactive"
            />
            <button
              type="button"
              aria-label="Zoom in"
              className="rounded p-1 text-lg leading-none text-ui-fg-subtle hover:bg-ui-bg-base-hover disabled:opacity-40"
              disabled={!lim}
              onClick={() => zoomTo(view.s * 1.2)}
            >
              +
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="small" variant="secondary" disabled={!loaded} onClick={() => loaded && setView(centred(limits(loaded).fill, loaded))}>
              Fill square
            </Button>
            <Button size="small" variant="secondary" disabled={!loaded} onClick={() => loaded && setView(centred(limits(loaded).whole, loaded))}>
              Fit whole photo
            </Button>
          </div>
          <Text size="xsmall" className="mt-2 max-w-[440px] text-ui-fg-subtle">
            Drag to move. Zoom with the slider, mouse wheel or two fingers. Double-click to reset.
            {gaps ? (png ? " Empty space around the photo stays see-through." : " Empty space around the photo is filled white.") : ""}
            {small ? ` Zoomed in a lot: this square is only ${sourcePx} px of the original, so it may look soft.` : ""}
          </Text>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ui-border-base px-5 py-3">
          <Button size="small" variant="transparent" onClick={onCancel}>
            Cancel{files.length > 1 ? " all" : ""}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="secondary" disabled={saving} onClick={() => advance(error ? null : file)}>
              {error ? "Skip this photo" : "Keep original shape"}
            </Button>
            <Button size="small" disabled={!loaded || saving} isLoading={saving} onClick={cropAndNext}>
              {index + 1 < files.length ? "Use square, next" : "Use square"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Space around the square where the rest of the photo shows, dimmed.
const PAD = 28
