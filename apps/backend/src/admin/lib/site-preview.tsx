import { ArrowPath, ArrowUpRightOnBox, ComputerDesktop, Eye, EyeSlash, Phone } from "@medusajs/icons"
import { Button, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { sdk } from "./sdk"
import { useStoreUrl } from "./site"

// Shared by the website editors (Homepage, About us, Blog, Help pages):
//   - "View on website": the page as shoppers see it now
//   - "Preview": the page with unpublished drafts, in a new tab
//   - live preview: the same, beside the editor, refreshed after every save

export const getPreviewLink = async (path: string) => {
  const { url } = await sdk.client.fetch<{ url: string | null }>("/admin/preview-link", { query: { path } })
  return url
}

export const openPreview = async (path: string) => {
  // Open the tab first (pop-up blockers allow it only straight after a click).
  const tab = window.open("about:blank", "_blank")
  const url = await getPreviewLink(path).catch(() => null)
  if (!url) {
    tab?.close()
    toast.error("Preview isn't ready on this server yet", { description: "It switches on with the next website update." })
    return
  }
  if (tab) tab.location.href = url
  else window.location.href = url
}

export function PageActions({
  path,
  preview,
  onTogglePreview,
}: {
  path: string
  preview?: boolean
  onTogglePreview?: () => void
}) {
  const storeUrl = useStoreUrl()
  return (
    <div className="flex flex-wrap gap-2">
      {onTogglePreview && (
        <Button size="small" variant="secondary" onClick={onTogglePreview} aria-pressed={!!preview}>
          {preview ? <EyeSlash /> : <Eye />}
          {preview ? "Hide live preview" : "Live preview"}
        </Button>
      )}
      <Button size="small" variant="secondary" onClick={() => openPreview(path)}>
        <Eye />
        Preview drafts
      </Button>
      {storeUrl && (
        <Button size="small" variant="secondary" asChild>
          <a href={`${storeUrl}${path}`} target="_blank" rel="noreferrer" data-keep>
            <ArrowUpRightOnBox />
            View on website
          </a>
        </Button>
      )}
    </div>
  )
}

const DESKTOP = 1440
const PHONE = 390

// The website (with drafts) in a frame. `version` changes after each save to reload it.
export function LivePreview({ path, version }: { path: string; version: number }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop")
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [width, setWidth] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    getPreviewLink(path)
      .then((u) => {
        setFailed(!u)
        setSrc(u)
      })
      .catch(() => setFailed(true))
  }, [path])

  useEffect(() => {
    load()
  }, [load, version])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const frameWidth = device === "desktop" ? DESKTOP : PHONE
  const scale = width ? Math.min(1, width / frameWidth) : 1
  const height = 900

  return (
    <div className="flex flex-col gap-y-2 rounded-lg bg-ui-bg-base p-3 shadow-elevation-card-rest" data-live-preview>
      <div className="flex items-center justify-between gap-2">
        <Text size="small" weight="plus">
          Live preview
        </Text>
        <div className="flex gap-1">
          <Button size="small" variant={device === "desktop" ? "primary" : "transparent"} onClick={() => setDevice("desktop")} aria-label="Computer view">
            <ComputerDesktop />
          </Button>
          <Button size="small" variant={device === "phone" ? "primary" : "transparent"} onClick={() => setDevice("phone")} aria-label="Phone view">
            <Phone />
          </Button>
          <Button size="small" variant="transparent" onClick={load} aria-label="Reload preview">
            <ArrowPath />
          </Button>
        </div>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-subtle" style={{ height: height * scale }}>
        {failed ? (
          <Text size="small" className="p-4 text-ui-fg-subtle">
            Preview switches on with the next website update.
          </Text>
        ) : (
          src && (
            <iframe
              title="Website preview"
              src={src}
              style={{
                width: frameWidth,
                height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                marginLeft: device === "phone" && width > PHONE ? (width - PHONE) / 2 : 0,
              }}
              className="border-0 bg-white"
            />
          )
        )}
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle">
        Shows saved drafts too. It reloads after each save.
      </Text>
    </div>
  )
}

// Asks before leaving the page while there are unsaved changes.
export const useLeaveWarning = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
}
