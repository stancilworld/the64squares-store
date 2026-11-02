import {
  Badge,
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { formatWhen, fromLocalInput, isFuture, isPast, toLocalInput } from "./dates"
import { ImageField, isVideoUrl, type RecommendedSize } from "./image-field"
import { sdk } from "./sdk"
import { LivePreview, PageActions, useLeaveWarning } from "./site-preview"
import type { ContentBlock } from "./types"

export type Field = "eyebrow" | "title" | "body" | "image_url" | "link_label" | "link_url"

export type SectionConfig = {
  key: string
  name: string
  help: string
  fields: Field[]
  // Several items (slides, points, images) or exactly one.
  many: boolean
  labels?: Partial<Record<Field, string>>
  // Hints shown under a field, e.g. how line breaks work in a heading.
  hints?: Partial<Record<Field, string>>
  // The image field also accepts GIF, MP4 and WebM animations.
  allowVideo?: boolean
  // Size to export for the image field, shown above the upload box.
  recommended?: RecommendedSize
}

const LABELS: Record<Field, string> = {
  eyebrow: "Small text above heading",
  title: "Heading",
  body: "Text",
  image_url: "Image",
  link_label: "Button text",
  link_url: "Button link (e.g. /shop)",
}

type FormState = Pick<ContentBlock, Field | "rank" | "is_active"> & { show_from: string | null; show_until: string | null }

const FIELDS: (keyof FormState)[] = ["eyebrow", "title", "body", "image_url", "link_label", "link_url", "rank", "is_active", "show_from", "show_until"]

// What the editor shows: the saved draft if there is one, otherwise what's on the website.
const formOf = (block: ContentBlock | null): FormState => {
  const src = { ...(block ?? {}), ...(block?.draft ?? {}) } as Partial<FormState>
  return {
    eyebrow: src.eyebrow ?? null,
    title: src.title ?? null,
    body: src.body ?? null,
    image_url: src.image_url ?? null,
    link_label: src.link_label ?? null,
    link_url: src.link_url ?? null,
    rank: src.rank ?? 0,
    is_active: block ? src.is_active ?? true : true,
    show_from: src.show_from ?? null,
    show_until: src.show_until ?? null,
  }
}

const clean = (f: FormState) => {
  const out: Record<string, unknown> = {}
  for (const k of FIELDS) out[k] = k === "rank" ? Number(f.rank) || 0 : f[k] === "" ? null : f[k]
  return out as FormState
}

// The state of an item, shown as a small label in the list and the editor.
export const blockStatus = (b: ContentBlock): { label: string; color: "green" | "grey" | "orange" | "blue" | "red" }[] => {
  const out: { label: string; color: "green" | "grey" | "orange" | "blue" | "red" }[] = []
  // A new item saved only as a draft: nothing of it is on the website yet.
  const newDraft = !!b.draft && !b.is_active && !b.title && !b.body && !b.image_url && !b.eyebrow
  if (b.draft && b.publish_at) out.push({ label: `Publishes ${formatWhen(b.publish_at)}`, color: "blue" })
  else if (b.draft) out.push({ label: newDraft ? "Draft (not on website yet)" : "Unpublished changes", color: "orange" })
  if (!b.is_active && !newDraft) out.push({ label: "Hidden", color: "grey" })
  else if (isPast(b.show_until)) out.push({ label: "Ended", color: "grey" })
  else if (isFuture(b.show_from)) out.push({ label: `Starts ${formatWhen(b.show_from)}`, color: "blue" })
  return out
}

const BlockDrawer = ({
  page,
  block,
  section,
  open,
  onClose,
  onSaved,
}: {
  page: string
  block: ContentBlock | null
  section: SectionConfig
  open: boolean
  onClose: () => void
  onSaved: () => void
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !block
  const [form, setForm] = useState<FormState>(() => formOf(block))
  const [initial, setInitial] = useState("")
  const [later, setLater] = useState(false)
  const [publishAt, setPublishAt] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const f = formOf(block)
      setForm(f)
      setInitial(JSON.stringify(clean(f)))
      setLater(!!block?.publish_at)
      setPublishAt(block?.publish_at ?? null)
    }
  }, [open, block])

  const dirty = open && JSON.stringify(clean(form)) !== initial
  useLeaveWarning(dirty)
  const badWindow = !!(form.show_from && form.show_until && new Date(form.show_until) <= new Date(form.show_from))
  const badLater = later && (!publishAt || !isFuture(publishAt))

  const done = (message: string) => {
    qc.invalidateQueries({ queryKey: ["content-blocks", page] })
    toast.success(message)
    onSaved()
    onClose()
  }
  const fail = (e: Error) => toast.error("Could not save", { description: e.message })

  // Publish now: the values go live and any draft is cleared.
  const publish = useMutation({
    mutationFn: () => {
      const v = clean(form)
      return sdk.client.fetch(isNew ? "/admin/content-blocks" : `/admin/content-blocks/${block!.id}`, {
        method: "POST",
        body: { ...v, draft: null, publish_at: null, ...(isNew ? { page, section: section.key } : {}) },
      })
    },
    onSuccess: () => done("Published. The website shows it within a minute."),
    onError: fail,
  })

  // Save draft (optionally publishing later): the website keeps showing the current version.
  const saveDraft = useMutation({
    mutationFn: () => {
      const draft = clean(form)
      const when = later ? publishAt : null
      return isNew
        ? sdk.client.fetch("/admin/content-blocks", {
            method: "POST",
            body: { page, section: section.key, rank: draft.rank, is_active: false, draft, publish_at: when },
          })
        : sdk.client.fetch(`/admin/content-blocks/${block!.id}`, { method: "POST", body: { draft, publish_at: when } })
    },
    onSuccess: () =>
      done(later ? `Scheduled. It goes on the website ${formatWhen(publishAt)}.` : "Draft saved. It's not on the website until you publish it."),
    onError: fail,
  })

  const discard = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/content-blocks/${block!.id}`, { method: "POST", body: { draft: null, publish_at: null } }),
    onSuccess: () => done("Draft discarded"),
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/content-blocks/${block!.id}`, { method: "DELETE" }),
    onSuccess: () => done("Deleted"),
  })

  const close = async () => {
    if (dirty && !(await prompt({ title: "Leave without saving?", description: "Your changes to this item will be lost.", confirmText: "Leave", cancelText: "Keep editing" }))) {
      return
    }
    onClose()
  }

  const label = (f: Field) => section.labels?.[f] ?? LABELS[f]
  const hint = (f: Field) =>
    section.hints?.[f] ? (
      <Text size="xsmall" className="text-ui-fg-subtle">
        {section.hints[f]}
      </Text>
    ) : null
  const busy = publish.isPending || saveDraft.isPending || discard.isPending

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{isNew ? `New ${section.name.toLowerCase()} item` : section.name}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          {block?.draft && (
            <div className="rounded-lg bg-ui-tag-orange-bg px-3 py-2 text-ui-tag-orange-text">
              <Text size="small">
                {block.publish_at
                  ? `These changes are scheduled to go on the website ${formatWhen(block.publish_at)}.`
                  : "You're editing a saved draft. The website still shows the published version."}
              </Text>
              <button type="button" className="txt-compact-small-plus underline" onClick={() => discard.mutate()} disabled={busy}>
                Discard draft
              </button>
            </div>
          )}
          {section.fields.map((f) =>
            f === "image_url" ? (
              <div key={f} className="flex flex-col gap-y-1">
                <ImageField
                  label={label(f)}
                  allowVideo={section.allowVideo}
                  recommended={section.recommended}
                  value={form.image_url}
                  onChange={(url) => setForm((s) => ({ ...s, image_url: url }))}
                />
                {hint(f)}
              </div>
            ) : f === "body" || f === "title" ? (
              <div key={f} className="flex flex-col gap-y-2">
                <Label htmlFor={`cb-${f}`}>{label(f)}</Label>
                <Textarea id={`cb-${f}`} rows={f === "body" ? 5 : 2} value={form[f] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))} />
                {hint(f)}
              </div>
            ) : (
              <div key={f} className="flex flex-col gap-y-2">
                <Label htmlFor={`cb-${f}`}>{label(f)}</Label>
                <Input id={`cb-${f}`} value={form[f] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))} />
                {hint(f)}
              </div>
            )
          )}
          {section.many && (
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="cb-rank">Order (lower shows first)</Label>
              <Input id="cb-rank" type="number" value={form.rank} onChange={(e) => setForm((s) => ({ ...s, rank: Number(e.target.value) }))} />
            </div>
          )}
          <div className="flex items-center gap-x-2">
            <Switch id="cb-active" checked={form.is_active} onCheckedChange={(v) => setForm((s) => ({ ...s, is_active: v }))} />
            <Label htmlFor="cb-active">Show on website</Label>
          </div>
          <div className="flex flex-col gap-y-2 rounded-lg bg-ui-bg-subtle p-3">
            <Text size="small" weight="plus">
              Only show between (optional)
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              For something seasonal, like a festive banner. Leave empty to always show it.
            </Text>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-y-1">
                <Label htmlFor="cb-from" size="xsmall">
                  From
                </Label>
                <Input id="cb-from" type="datetime-local" value={toLocalInput(form.show_from)} onChange={(e) => setForm((s) => ({ ...s, show_from: fromLocalInput(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label htmlFor="cb-until" size="xsmall">
                  Until
                </Label>
                <Input
                  id="cb-until"
                  type="datetime-local"
                  aria-invalid={badWindow}
                  value={toLocalInput(form.show_until)}
                  onChange={(e) => setForm((s) => ({ ...s, show_until: fromLocalInput(e.target.value) }))}
                />
              </div>
            </div>
            {badWindow && (
              <Text size="xsmall" className="text-ui-fg-error">
                "Until" must be after "From".
              </Text>
            )}
          </div>
          <div className="flex flex-col gap-y-2 rounded-lg bg-ui-bg-subtle p-3">
            <label className="flex items-center gap-x-2">
              <Checkbox checked={later} onCheckedChange={(v) => setLater(v === true)} />
              <Text size="small" weight="plus">
                Publish these changes later
              </Text>
            </label>
            {later && (
              <div className="flex flex-col gap-y-1">
                <Input
                  type="datetime-local"
                  aria-label="Publish on"
                  aria-invalid={badLater}
                  value={toLocalInput(publishAt)}
                  onChange={(e) => setPublishAt(fromLocalInput(e.target.value))}
                />
                <Text size="xsmall" className={badLater ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
                  {badLater ? "Pick a time in the future." : "Until then the website keeps the current version. Use Preview to check it first."}
                </Text>
              </div>
            )}
          </div>
        </Drawer.Body>
        <Drawer.Footer className="flex-wrap">
          {!isNew && section.many && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (await prompt({ title: "Delete this item?", description: "It is removed from the website." })) {
                  remove.mutate()
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {later ? (
            <Button isLoading={saveDraft.isPending} disabled={busy || badWindow || badLater} onClick={() => saveDraft.mutate()}>
              Schedule
            </Button>
          ) : (
            <>
              <Button variant="secondary" isLoading={saveDraft.isPending} disabled={busy || badWindow} onClick={() => saveDraft.mutate()}>
                Save draft
              </Button>
              <Button isLoading={publish.isPending} disabled={busy || badWindow} onClick={() => publish.mutate()}>
                Publish
              </Button>
            </>
          )}
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const PREVIEW_KEY = "stancil_live_preview"
const readPref = () => {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1"
  } catch {
    return false
  }
}

// Lists every section of a page with its items; clicking an item opens its editor.
export const ContentEditor = ({
  page,
  title,
  intro,
  sections,
  sitePath = "/",
}: {
  page: string
  title: string
  intro: string
  sections: SectionConfig[]
  sitePath?: string
}) => {
  const [state, setState] = useState<{ block: ContentBlock | null; section: SectionConfig; open: boolean }>({
    block: null,
    section: sections[0],
    open: false,
  })
  const [preview, setPreview] = useState(readPref)
  const [version, setVersion] = useState(0)
  const togglePreview = () => {
    setPreview((p) => {
      try {
        localStorage.setItem(PREVIEW_KEY, p ? "0" : "1")
      } catch {
        // Not saved; fine.
      }
      return !p
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ["content-blocks", page],
    queryFn: () => sdk.client.fetch<{ content_blocks: ContentBlock[] }>("/admin/content-blocks", { query: { page } }),
  })
  const drafts = useMemo(() => (data?.content_blocks ?? []).filter((b) => b.draft).length, [data])

  const list = (
    <div className="flex flex-col gap-y-3">
      {isLoading && <Text>Loading...</Text>}
      {sections.map((section) => {
        const blocks = (data?.content_blocks ?? []).filter((b) => b.section === section.key)
        return (
          <Container key={section.key} className="divide-y p-0">
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <div>
                <Heading level="h2">{section.name}</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {section.help}
                </Text>
              </div>
              {(section.many || blocks.length === 0) && (
                <Button size="small" variant="secondary" onClick={() => setState({ block: null, section, open: true })}>
                  Add
                </Button>
              )}
            </div>
            {blocks.map((b, i) => {
              const shown = { ...b, ...(b.draft ?? {}) } as ContentBlock
              return (
                <button
                  key={b.id}
                  type="button"
                  data-block={b.id}
                  onClick={() => setState({ block: b, section, open: true })}
                  className="flex w-full items-center gap-x-4 px-6 py-3 text-left hover:bg-ui-bg-base-hover"
                >
                  {shown.image_url && isVideoUrl(shown.image_url) ? (
                    <video src={shown.image_url} muted className="h-10 w-10 rounded object-cover" />
                  ) : shown.image_url ? (
                    <img src={shown.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-ui-bg-component" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Text size="small" weight="plus">
                      {shown.title || (section.fields.includes("title") ? "(no heading)" : `Image ${i + 1}`)}
                    </Text>
                    {shown.body && (
                      <Text size="xsmall" className="line-clamp-1 text-ui-fg-subtle">
                        {shown.body}
                      </Text>
                    )}
                    {!shown.image_url && section.fields.includes("image_url") && section.key !== "why_point" && (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        No image yet (shows a grey box)
                      </Text>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {blockStatus(b).map((s) => (
                      <Badge key={s.label} size="2xsmall" color={s.color}>
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                </button>
              )
            })}
          </Container>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="max-w-xl">
          <Heading level="h1">{title}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {intro} Use <strong>Save draft</strong> to work on a change without shoppers seeing it, and <strong>Preview drafts</strong> to check it
            on the real page.
          </Text>
          {drafts > 0 && (
            <Text size="small" className="mt-1 text-ui-tag-orange-text">
              {drafts === 1 ? "1 item has" : `${drafts} items have`} unpublished changes.
            </Text>
          )}
        </div>
        <PageActions path={sitePath} preview={preview} onTogglePreview={togglePreview} />
      </Container>
      {preview ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {list}
          <div className="xl:sticky xl:top-3 xl:self-start">
            <LivePreview path={sitePath} version={version} />
          </div>
        </div>
      ) : (
        list
      )}
      <BlockDrawer
        page={page}
        block={state.block}
        section={state.section}
        open={state.open}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        onSaved={() => setVersion((v) => v + 1)}
      />
    </div>
  )
}
