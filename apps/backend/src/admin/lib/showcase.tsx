import { Badge, Button, Input, Label, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, useMemo, useRef, useState } from "react"
import { sdk } from "./sdk"
import { useStoreUrl } from "./site"

// Shared parts of the Advertisements section: types, the website preview, the library
// picker, uploading to the library and the page picker for buttons.

export type Scene = { key: string; name: string; description: string; poster: string; used_by: string[] }
export type Asset = { id: string; name: string; kind: "image" | "video"; url: string; poster_url: string | null; mime: string | null; size: number | null; width: number | null; height: number | null; used_by: string[]; created_at: string }
export type Visual = { kind: "scene"; scene: string } | { kind: "asset"; asset_id: string; mobile_asset_id?: string | null; fit?: "cover" | "contain"; focus?: string }
export type Reward = { type: "xp_boost"; factor: number; hours: number } | { type: "passes"; count: number }
export type Action =
  | { kind: "none" }
  | { kind: "link"; label: string; url: string }
  | { kind: "coupon"; code: string; label?: string; url?: string; members_only?: boolean }
  | { kind: "reward"; label: string; reward: Reward }
export type AdState = "draft" | "paused" | "scheduled" | "live" | "ended"
export type Ad = {
  id: string
  name: string
  status: "draft" | "live" | "paused"
  placement: string
  rank: number
  starts_at: string | null
  ends_at: string | null
  audience: "everyone" | "guests" | "members"
  visual: Visual
  tag: string | null
  headline: string | null
  body: string | null
  theme: "light" | "dark"
  align: "left" | "center" | "right"
  position: "top" | "middle" | "bottom"
  scrim: boolean
  countdown_to: string | null
  countdown_label: string | null
  action: Action
  max_claims: number | null
  views: number
  clicks: number
  claims: number
  state: AdState
  created_at: string
}
export type ShowcaseData = { ads: Ad[]; assets: Asset[]; scenes: Scene[]; default: Visual }

export const useShowcase = () =>
  useQuery({ queryKey: ["showcase"], queryFn: () => sdk.client.fetch<ShowcaseData>("/admin/showcase") })

export const STATE: Record<AdState, { label: string; color: "green" | "blue" | "grey" | "orange" | "red" }> = {
  live: { label: "Live now", color: "green" },
  scheduled: { label: "Scheduled", color: "blue" },
  draft: { label: "Draft", color: "grey" },
  paused: { label: "Paused", color: "orange" },
  ended: { label: "Ended", color: "grey" },
}

export const rewardText = (r: Reward) => (r.type === "xp_boost" ? `${r.factor}x XP for ${r.hours} h` : `${r.count} Tournament ${r.count === 1 ? "Pass" : "Passes"}`)

export const actionText = (a: Action) =>
  a.kind === "none" ? "No button" : a.kind === "link" ? `${a.label} → ${a.url}` : a.kind === "coupon" ? `Coupon ${a.code}${a.members_only ? " (signed-in players)" : ""}` : `${a.label}: ${rewardText(a.reward)}`

export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null

const mb = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
export const assetMeta = (a: Asset) => [a.kind === "video" ? "Video" : a.mime === "image/gif" ? "GIF" : "Picture", a.width && a.height ? `${a.width}×${a.height}` : "", mb(a.size)].filter(Boolean).join(" · ")

// ---------------------------------------------------------------- uploading

// What a browser can tell about a file before it goes up: size, and a still for videos.
const probe = (file: File) =>
  new Promise<{ width: number | null; height: number | null; poster: Blob | null }>((resolve) => {
    const url = URL.createObjectURL(file)
    const done = (r: { width: number | null; height: number | null; poster: Blob | null }) => {
      URL.revokeObjectURL(url)
      resolve(r)
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video")
      v.muted = true
      v.preload = "auto"
      v.src = url
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.5, (v.duration || 1) / 4)
      }
      v.onseeked = () => {
        const c = document.createElement("canvas")
        c.width = v.videoWidth
        c.height = v.videoHeight
        c.getContext("2d")?.drawImage(v, 0, 0)
        c.toBlob((b) => done({ width: v.videoWidth, height: v.videoHeight, poster: b }), "image/webp", 0.82)
      }
      v.onerror = () => done({ width: null, height: null, poster: null })
      return
    }
    const img = new Image()
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight, poster: null })
    img.onerror = () => done({ width: null, height: null, poster: null })
    img.src = url
  })

export const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,.gif,.svg,.heic,.heif"

// Uploads files and adds each to the library; returns the new library items.
export const uploadToLibrary = async (files: File[]): Promise<Asset[]> => {
  const out: Asset[] = []
  for (const file of files) {
    const kind = file.type.startsWith("video/") ? "video" : "image"
    const info = await probe(file)
    const { files: up } = await sdk.admin.upload.create({ files: [file] })
    let poster_url: string | null = null
    if (info.poster) {
      const still = new File([info.poster], `${file.name.replace(/\.[^.]+$/, "")}-still.webp`, { type: "image/webp" })
      poster_url = (await sdk.admin.upload.create({ files: [still] })).files[0]?.url ?? null
    }
    const { asset } = await sdk.client.fetch<{ asset: Asset }>("/admin/showcase/assets", {
      method: "POST",
      body: {
        name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 120) || "Untitled",
        kind,
        url: up[0].url,
        poster_url,
        mime: file.type || null,
        size: file.size,
        width: info.width,
        height: info.height,
      },
    })
    out.push({ ...asset, used_by: [] })
  }
  return out
}

export function UploadButton({ onDone, label = "Upload", variant = "secondary" }: { onDone: (a: Asset[]) => void; label?: string; variant?: "primary" | "secondary" }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          if (!files.length) return
          setBusy(true)
          try {
            const made = await uploadToLibrary(files)
            toast.success(made.length === 1 ? "Added to the library" : `${made.length} files added to the library`)
            onDone(made)
          } catch (err) {
            toast.error((err as Error).message || "Upload failed")
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button type="button" size="small" variant={variant} isLoading={busy} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  )
}

// ---------------------------------------------------------------- pictures of things

export function Thumb({ visual, data, storeUrl, className = "" }: { visual: Visual; data: ShowcaseData; storeUrl: string | null; className?: string }) {
  if (visual.kind === "scene") {
    const s = data.scenes.find((x) => x.key === visual.scene)
    return s && storeUrl ? <img src={storeUrl + s.poster} alt="" className={`object-cover ${className}`} /> : <div className={`bg-ui-bg-component ${className}`} />
  }
  const a = data.assets.find((x) => x.id === visual.asset_id)
  if (!a) return <div className={`bg-ui-bg-component ${className}`} />
  const src = a.kind === "video" ? a.poster_url : a.url
  return src ? <img src={src} alt="" className={`object-cover ${className}`} /> : <video src={a.url} muted className={`object-cover ${className}`} />
}

// The website's window, as it will look (the 3D designs show as their picture here).
export function Preview({ ad, data, phone }: { ad: Partial<Ad> & { visual: Visual }; data: ShowcaseData; phone: boolean }) {
  const storeUrl = useStoreUrl()
  const v = ad.visual
  const asset = v.kind === "asset" ? data.assets.find((a) => a.id === (phone && v.mobile_asset_id ? v.mobile_asset_id : v.asset_id)) : null
  const scene = v.kind === "scene" ? data.scenes.find((s) => s.key === v.scene) : null
  const fit = v.kind === "asset" ? (v.fit ?? "cover") : "cover"
  const focus = v.kind === "asset" ? (v.focus ?? "50% 50%") : "50% 50%"
  const dark = ad.theme === "dark"
  const pos = ad.position ?? "bottom"
  const align = ad.align ?? "left"
  const fg = dark ? "#161616" : "#fff"
  const shade = dark ? "255 255 255" : "0 0 0"
  const scrim =
    ad.scrim === false
      ? "none"
      : pos === "middle"
        ? `rgb(${shade} / ${dark ? 0.55 : 0.45})`
        : `linear-gradient(to ${pos === "bottom" ? "top" : "bottom"}, rgb(${shade} / ${dark ? 0.85 : 0.78}), rgb(${shade} / ${dark ? 0.4 : 0.35}) 45%, transparent 75%)`
  const box: CSSProperties = { width: phone ? 360 : 440, height: phone ? 230 : 300 }
  const media: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, objectPosition: focus }
  const a = ad.action ?? { kind: "none" }
  const button = (text: string) => <span style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 14px", borderRadius: 8, background: "#ffb300", color: "#161616", fontWeight: 800, fontSize: 13 }}>{text}</span>
  const hasWords = ad.tag || ad.headline || ad.body || ad.countdown_to || a.kind !== "none"
  return (
    <div style={{ ...box, position: "relative", overflow: "hidden", background: "#161616", borderRadius: 10, flex: "none", fontFamily: "inherit" }}>
      {scene && storeUrl && <img src={storeUrl + scene.poster} alt="" style={media} />}
      {asset && (asset.kind === "video" ? <video key={asset.url} src={asset.url} poster={asset.poster_url ?? undefined} muted autoPlay loop playsInline style={media} /> : <img src={asset.url} alt="" style={media} />)}
      {v.kind === "asset" && !asset && <div style={{ ...media, display: "grid", placeItems: "center", color: "#888", fontSize: 13 }}>Choose a picture or video</div>}
      {hasWords && (
        <div style={{ position: "absolute", inset: 0, display: "flex", padding: phone ? "16px 18px" : "22px 24px", color: fg, background: scrim, alignItems: pos === "top" ? "flex-start" : pos === "middle" ? "center" : "flex-end", justifyContent: align === "left" ? "flex-start" : align === "center" ? "center" : "flex-end", textAlign: align }}>
          <div style={{ maxWidth: "92%", display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : align === "center" ? "center" : "flex-end" }}>
            {ad.tag && <span style={{ marginBottom: 8, padding: "3px 9px", borderRadius: 999, background: "#ffb300", color: "#161616", fontSize: 11, fontWeight: 700 }}>{ad.tag}</span>}
            {ad.headline && <div style={{ fontSize: phone ? 21 : 25, lineHeight: 1.08, fontWeight: 800, textWrap: "balance" }}>{ad.headline}</div>}
            {ad.body && <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.4, opacity: 0.85 }}>{ad.body}</div>}
            {ad.countdown_to && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 600 }}>
                {ad.countdown_label && <span style={{ opacity: 0.85 }}>{ad.countdown_label}</span>}
                {["02d", "14h", "30m"].map((x) => (
                  <span key={x} style={{ padding: "3px 6px", borderRadius: 6, background: "rgb(0 0 0 / .45)", color: "#fff", fontWeight: 800 }}>
                    {x}
                  </span>
                ))}
              </div>
            )}
            {a.kind !== "none" && (
              <div style={{ marginTop: 10 }}>
                {a.kind === "link" && button(a.label || "Button")}
                {a.kind === "reward" && button(a.label || "Claim")}
                {a.kind === "coupon" &&
                  (a.members_only ? (
                    button(a.label || "Get the code")
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 6px 0 12px", border: "2px dashed #ffb300", borderRadius: 8, background: "rgb(0 0 0 / .5)", color: "#fff", fontWeight: 800, fontSize: 14 }}>
                      {a.code || "CODE"}
                      <span style={{ padding: "3px 8px", borderRadius: 5, background: "#ffb300", color: "#161616", fontSize: 11 }}>Copy</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- choosing from the library

export function LibraryPicker({ data, value, onChange, onUploaded, assetsOnly = false, allowNone = false }: { data: ShowcaseData; value: Visual | null; onChange: (v: Visual | null) => void; onUploaded: (a: Asset[]) => void; assetsOnly?: boolean; allowNone?: boolean }) {
  const storeUrl = useStoreUrl()
  const selected = (v: Visual) => !!value && value.kind === v.kind && (v.kind === "scene" ? value.kind === "scene" && value.scene === v.scene : value.kind === "asset" && value.asset_id === v.asset_id)
  const card = (key: string, v: Visual | null, img: string | null, video: string | null, title: string, sub: string, badge?: string) => {
    const on = v ? selected(v) : !value
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(v)}
        className={`overflow-hidden rounded-lg border text-left transition-colors ${on ? "border-ui-fg-interactive ring-2 ring-ui-fg-interactive" : "border-ui-border-base hover:border-ui-border-strong"}`}
      >
        <div className="relative aspect-[16/10] bg-ui-bg-component">
          {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          {!img && video && <video src={video} muted className="absolute inset-0 h-full w-full object-cover" />}
          {badge && (
            <span className="absolute left-2 top-2">
              <Badge size="2xsmall" color="purple">
                {badge}
              </Badge>
            </span>
          )}
        </div>
        <div className="px-2.5 py-2">
          <Text size="small" weight="plus" className="truncate">
            {title}
          </Text>
          <Text size="xsmall" className="truncate text-ui-fg-subtle">
            {sub}
          </Text>
        </div>
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {allowNone && card("none", null, null, null, "None", "Use the main one")}
        {!assetsOnly && data.scenes.map((s) => card(s.key, { kind: "scene", scene: s.key }, storeUrl ? storeUrl + s.poster : null, null, s.name, "Live 3D design", "3D"))}
        {data.assets.map((a) => card(a.id, { kind: "asset", asset_id: a.id }, a.kind === "video" ? a.poster_url : a.url, a.url, a.name, assetMeta(a), a.kind === "video" ? "Video" : a.mime === "image/gif" ? "GIF" : undefined))}
      </div>
      <div className="flex items-center gap-x-3">
        <UploadButton onDone={(made) => {
          onUploaded(made)
          if (made[0]) onChange({ kind: "asset", asset_id: made[0].id })
        }} label="Upload new" />
        <Text size="xsmall" className="text-ui-fg-subtle">
          Pictures (JPG, PNG, WebP, AVIF, SVG), GIFs and videos (MP4, WebM, MOV). Best at 1600×1000 or larger, with the important part in the middle.
        </Text>
      </div>
    </div>
  )
}

// Click on the picture to choose the point that always stays in view when it's cropped.
export function FocusPicker({ asset, focus, onChange }: { asset: Asset; focus: string; onChange: (f: string) => void }) {
  const [x, y] = focus.split(" ").map((p) => parseFloat(p))
  const src = asset.kind === "video" ? asset.poster_url : asset.url
  if (!src) return null
  return (
    <div
      className="relative w-full max-w-[320px] cursor-crosshair overflow-hidden rounded-md"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onChange(`${Math.round(((e.clientX - r.left) / r.width) * 100)}% ${Math.round(((e.clientY - r.top) / r.height) * 100)}%`)
      }}
    >
      <img src={src} alt="" className="block w-full" />
      <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,.5)]" style={{ left: `${x}%`, top: `${y}%` }} />
    </div>
  )
}

// ---------------------------------------------------------------- choosing a page

type Target = { path: string; label: string; type: string }
const KIND: Record<string, string> = { product: "Products", news: "News", post: "Journal", tournament: "Tournaments", page: "Help pages", static: "Pages" }
const PLAY = [
  { path: "/play/online", label: "Play online" },
  { path: "/play/tournaments", label: "Tournaments (Play)" },
  { path: "/play/puzzles", label: "Puzzles" },
  { path: "/play/computer", label: "Play the computer" },
  { path: "/play/my-tournaments", label: "My tournaments & passes" },
  { path: "/play/leaderboard", label: "Leaderboard" },
  { path: "/account", label: "Sign in / my account" },
]

export function LinkPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { data } = useQuery({ queryKey: ["seo-link-targets"], queryFn: () => sdk.client.fetch<{ targets: Target[] }>("/admin/seo/link-targets"), staleTime: 300_000 })
  const [q, setQ] = useState("")
  const groups = useMemo(() => {
    const all = [...PLAY.map((p) => ({ ...p, type: "play" })), ...(data?.targets ?? [])]
    const needle = q.trim().toLowerCase()
    const hit = all.filter((t) => !needle || t.label.toLowerCase().includes(needle) || t.path.includes(needle))
    const out = new Map<string, typeof hit>()
    for (const t of hit) {
      const k = t.type === "play" ? "Play" : (KIND[t.type] ?? "Pages")
      out.set(k, [...(out.get(k) ?? []), t])
    }
    return [...out.entries()]
  }, [data, q])
  const known = groups.some(([, ts]) => ts.some((t) => t.path === value))
  return (
    <div className="flex flex-col gap-y-2">
      <Input size="small" placeholder="Search pages, products, tournaments…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[220px] overflow-y-auto rounded-md border border-ui-border-base">
        {groups.map(([k, ts]) => (
          <div key={k}>
            <Text size="xsmall" weight="plus" className="sticky top-0 bg-ui-bg-subtle px-3 py-1.5 text-ui-fg-subtle">
              {k}
            </Text>
            {ts.slice(0, 60).map((t) => (
              <button
                key={t.path}
                type="button"
                onClick={() => onChange(t.path)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left txt-small hover:bg-ui-bg-base-hover ${t.path === value ? "bg-ui-bg-highlight text-ui-fg-interactive" : ""}`}
              >
                <span className="truncate">{t.label}</span>
                <span className="shrink-0 truncate text-ui-fg-muted">{t.path}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-y-1">
        <Label size="xsmall">Or any address</Label>
        <Input size="small" placeholder="/shop or https://…" value={value} onChange={(e) => onChange(e.target.value.trim())} />
        {value && !known && !/^\/(?!\/)|^https:\/\//.test(value) && (
          <Text size="xsmall" className="text-ui-fg-error">
            Start with / for a page of the website, or https:// for another site.
          </Text>
        )}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-ui-border-base bg-ui-bg-subtle p-0.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`rounded px-3 py-1 txt-compact-small-plus transition-colors ${value === v ? "bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest" : "text-ui-fg-subtle hover:text-ui-fg-base"}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

