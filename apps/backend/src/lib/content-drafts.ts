import type { MedusaContainer } from "@medusajs/framework/types"
import { updateContentBlockWorkflow } from "../workflows/content-block"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// Drafts and schedules for website content blocks (Website → Homepage / About us).
//   draft       values saved with "Save draft": not on the website until published
//   publish_at  publish the draft automatically at this time
//   show_from / show_until   only show the item on the website in this window

export const DRAFT_FIELDS = [
  "eyebrow",
  "title",
  "body",
  "image_url",
  "link_label",
  "link_url",
  "rank",
  "is_active",
  "show_from",
  "show_until",
] as const

type Block = Record<string, any> & {
  draft?: Record<string, unknown> | null
  is_active?: boolean
  show_from?: string | Date | null
  show_until?: string | Date | null
}

const time = (v: unknown) => (v ? new Date(v as string).getTime() : null)

// The block as it will look once its draft is published.
export const withDraft = <T extends Block>(b: T): T => {
  if (!b.draft) return b
  const next: Record<string, unknown> = { ...b }
  for (const k of DRAFT_FIELDS) {
    if (k in b.draft) next[k] = b.draft[k]
  }
  return next as T
}

// Whether a (published) block is on the website now. Previews also show items whose start
// time hasn't come yet, so they can be checked in advance.
export const isShowing = (b: Block, now: number, preview = false) => {
  if (!b.is_active) return false
  const from = time(b.show_from)
  const until = time(b.show_until)
  if (until !== null && until <= now) return false
  if (!preview && from !== null && from > now) return false
  return true
}

// What the website gets: no draft bookkeeping.
export const publicBlock = (b: Block) => {
  const { draft, publish_at, ...rest } = b
  void draft
  void publish_at
  return rest
}

// The values to save when publishing a draft.
export const publishData = (b: Block) => {
  const d = (b.draft ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = { draft: null, publish_at: null }
  for (const k of DRAFT_FIELDS) {
    if (k in d) data[k] = k === "show_from" || k === "show_until" ? (d[k] ? new Date(d[k] as string) : null) : d[k]
  }
  return data
}

// Publishes every draft whose time has come. Run every minute by jobs/publish-scheduled.ts.
export const publishDueDrafts = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const due = await content.listContentBlocks({ publish_at: { $lte: new Date() } } as never, { take: 200 })
  let published = 0
  for (const b of due as Block[]) {
    if (!b.draft) {
      await updateContentBlockWorkflow(container).run({ input: { id: b.id, data: { publish_at: null } } })
      continue
    }
    await updateContentBlockWorkflow(container).run({ input: { id: b.id, data: publishData(b) as never } })
    published++
  }
  return published
}
