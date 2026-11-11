import { Input, Label, Switch, Text, Textarea } from "@medusajs/ui"
import { useMemo } from "react"
import { auditSeo, type Check, DESC_MAX, scoreOf, TITLE_MAX } from "../../lib/seo-audit"
import { ImageField } from "./image-field"

// The SEO panel (like Yoast): search title, description, focus keyword, share picture and
// "don't show in search", with a Google preview, a WhatsApp/Facebook preview and checks.

export type SeoValues = { title: string | null; description: string | null; image_url: string | null; keyword: string | null; noindex: boolean }
export const EMPTY_SEO: SeoValues = { title: null, description: null, image_url: null, keyword: null, noindex: false }

const DOT: Record<Check["level"], string> = { good: "bg-ui-tag-green-icon", ok: "bg-ui-tag-orange-icon", bad: "bg-ui-tag-red-icon" }
const SCORE_TEXT: Record<Check["level"], string> = { good: "Good", ok: "Could be better", bad: "Needs work" }

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export const ScoreDot = ({ level }: { level: Check["level"] }) => <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[level]}`} aria-hidden="true" />

export function SeoPanel({
  value,
  onChange,
  defaults,
  path,
  html = "",
  site = "the64squares.in",
  compact = false,
}: {
  value: SeoValues
  onChange: (v: SeoValues) => void
  // What the website uses when a field is left empty.
  defaults: { title: string; description: string; image: string | null }
  path: string
  html?: string
  site?: string
  compact?: boolean
}) {
  const title = value.title?.trim() || defaults.title
  const description = value.description?.trim() || defaults.description
  const image = value.image_url || defaults.image
  const checks = useMemo(
    () => auditSeo({ title, description, path, html, keyword: value.keyword, image, noindex: value.noindex }),
    [title, description, path, html, value.keyword, image, value.noindex]
  )
  const score = scoreOf(checks)
  const set = <K extends keyof SeoValues>(k: K, v: SeoValues[K]) => onChange({ ...value, [k]: v })
  const crumbs = [site, ...path.split("/").filter(Boolean)].join(" › ")

  return (
    <div className="flex flex-col gap-y-5">
      <div className="flex items-center gap-2">
        <ScoreDot level={score} />
        <Text size="small" weight="plus">
          SEO: {SCORE_TEXT[score]}
        </Text>
      </div>

      {/* Google preview */}
      <div>
        <Text size="xsmall" className="mb-1.5 text-ui-fg-muted">
          In Google
        </Text>
        <div className="rounded-lg border border-ui-border-base bg-white p-4 font-[arial,sans-serif] text-left">
          <p className="truncate text-[12px] text-[#202124]">{crumbs}</p>
          <p className="mt-1 text-[18px] leading-[1.3] text-[#1a0dab]">{cut(title, TITLE_MAX + 3)}</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-[#4d5156]">{cut(description || "Google will pick some text from the page.", DESC_MAX + 3)}</p>
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
        <div className="flex flex-col gap-y-1.5">
          <Label size="small" htmlFor="seo-title">
            Search title
          </Label>
          <Input id="seo-title" value={value.title ?? ""} placeholder={defaults.title} onChange={(e) => set("title", e.target.value || null)} />
          <Text size="xsmall" className={title.length > TITLE_MAX ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
            {title.length}/{TITLE_MAX} letters{value.title ? "" : " (default)"}
          </Text>
        </div>
        <div className="flex flex-col gap-y-1.5">
          <Label size="small" htmlFor="seo-keyword">
            Focus keyword
          </Label>
          <Input id="seo-keyword" value={value.keyword ?? ""} placeholder="e.g. magnetic chess set" onChange={(e) => set("keyword", e.target.value || null)} />
          <Text size="xsmall" className="text-ui-fg-subtle">
            The search you most want this page found for.
          </Text>
        </div>
      </div>
      <div className="flex flex-col gap-y-1.5">
        <Label size="small" htmlFor="seo-desc">
          Search description
        </Label>
        <Textarea id="seo-desc" rows={2} value={value.description ?? ""} placeholder={defaults.description || "One or two sentences that make people want to click."} onChange={(e) => set("description", e.target.value || null)} />
        <Text size="xsmall" className={description.length > DESC_MAX ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
          {description.length}/{DESC_MAX} letters{value.description ? "" : " (default)"}
        </Text>
      </div>

      {/* Link preview */}
      <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
        <ImageField
          label="Share picture"
          allowVideo={false}
          value={value.image_url}
          onChange={(url) => set("image_url", url)}
          recommended={{ width: 1200, height: 630, note: "Shown when the link is shared on WhatsApp, Facebook or X. Empty = the page's main picture." }}
        />
        <div>
          <Text size="xsmall" className="mb-1.5 text-ui-fg-muted">
            When shared
          </Text>
          <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-component">
            <div className="aspect-[1.91/1] bg-ui-bg-base-hover">{image && <img src={image} alt="" className="h-full w-full object-cover" />}</div>
            <div className="px-3 py-2">
              <p className="text-[11px] uppercase text-ui-fg-muted">{site}</p>
              <p className="truncate text-[14px] font-semibold text-ui-fg-base">{title}</p>
              <p className="line-clamp-2 text-[12px] text-ui-fg-subtle">{description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base p-3">
        <div>
          <Label size="small">Don&apos;t show in search</Label>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Hides this page from Google (it stays on the website).
          </Text>
        </div>
        <Switch checked={value.noindex} onCheckedChange={(v) => set("noindex", v)} />
      </div>

      <div>
        <Text size="small" weight="plus" className="mb-2">
          Checks
        </Text>
        <ul className="flex flex-col gap-y-1.5">
          {[...checks]
            .sort((a, b) => ["bad", "ok", "good"].indexOf(a.level) - ["bad", "ok", "good"].indexOf(b.level))
            .map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <span className="mt-1.5">
                  <ScoreDot level={c.level} />
                </span>
                <Text size="small" className="text-ui-fg-subtle">
                  {c.text}
                </Text>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
