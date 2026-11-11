import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  Switch,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { formatWhen, fromLocalInput, isFuture, toLocalInput } from "../../../lib/dates"
import { ImageField } from "../../../lib/image-field"
import { RichEditor } from "../../../lib/rich-editor"
import { LinkSuggestions } from "../../../lib/link-suggestions"
import { EMPTY_SEO, SeoPanel, type SeoValues } from "../../../lib/seo-panel"
import type { Editor } from "@tiptap/react"
import { sdk } from "../../../lib/sdk"
import { getPreviewLink, PageActions, useLeaveWarning } from "../../../lib/site-preview"

type Article = {
  id: string
  title: string
  handle: string
  excerpt: string | null
  body_html: string
  cover_url: string | null
  topic: string
  author: string
  featured: boolean
  status: "draft" | "published"
  published_at: string | null
  created_at: string
}
type FormState = Omit<Article, "id" | "created_at">

const EMPTY: FormState = {
  title: "",
  handle: "",
  excerpt: null,
  body_html: "",
  cover_url: null,
  topic: "News",
  author: "The 64 Squares team",
  featured: false,
  status: "draft",
  published_at: null,
}

// Suggested topics; any other word can be typed in.
const TOPICS = ["News", "Tournaments", "Players", "Club news", "Learning", "Shop", "Announcements"]

const toHandle = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not published"

const ArticleEditor = ({
  article,
  open,
  onClose,
  topics,
}: {
  article: Article | null
  open: boolean
  onClose: () => void
  topics: string[]
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !article
  const [form, setForm] = useState<FormState>(EMPTY)
  const [initial, setInitial] = useState("")
  const [savedId, setSavedId] = useState<string | null>(null)
  const [tab, setTab] = useState<"write" | "seo">("write")
  const [seo, setSeo] = useState<SeoValues>(EMPTY_SEO)
  const [seoInitial, setSeoInitial] = useState(JSON.stringify(EMPTY_SEO))
  const [editor, setEditor] = useState<Editor | null>(null)
  // The article's saved search settings.
  const { data: savedSeo } = useQuery({
    queryKey: ["seo-meta", "news", article?.id],
    queryFn: () => sdk.client.fetch<{ seo: SeoValues | null }>(`/admin/seo/meta?type=news&key=${article!.id}`),
    enabled: open && !!article?.id,
  })
  useEffect(() => {
    if (!open) return
    const v = (article?.id && savedSeo?.seo) || EMPTY_SEO
    setSeo(v)
    setSeoInitial(JSON.stringify(v))
  }, [open, article?.id, savedSeo])

  useEffect(() => {
    if (open) {
      const src: Partial<FormState> = article ?? {}
      // Only the editable fields; the API rejects read-only ones like updated_at.
      const f = Object.fromEntries((Object.keys(EMPTY) as (keyof FormState)[]).map((k) => [k, src[k] ?? EMPTY[k]])) as FormState
      setForm(f)
      setInitial(JSON.stringify(f))
      setSavedId(article?.id ?? null)
      setTab("write")
    }
  }, [open, article])
  const seoDirty = JSON.stringify(seo) !== seoInitial
  const dirty = open && (JSON.stringify(form) !== initial || seoDirty)
  useLeaveWarning(dirty)
  const scheduled = form.status === "published" && isFuture(form.published_at)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const write = async () => {
    const res = await sdk.client.fetch<{ article: Article }>(savedId ? `/admin/news/${savedId}` : "/admin/news", { method: "POST", body: form })
    setSavedId(res.article.id)
    setInitial(JSON.stringify(form))
    if (seoDirty) {
      await sdk.client.fetch("/admin/seo/meta", { method: "POST", body: { target_type: "news", target_key: res.article.id, ...seo } })
      setSeoInitial(JSON.stringify(seo))
      qc.invalidateQueries({ queryKey: ["seo-pages"] })
    }
    qc.invalidateQueries({ queryKey: ["news"] })
    return res.article
  }

  const close = async () => {
    if (dirty && !(await prompt({ title: "Leave without saving?", description: "Your changes to this article will be lost.", confirmText: "Leave", cancelText: "Keep editing" }))) {
      return
    }
    onClose()
  }

  const save = useMutation({
    mutationFn: write,
    onSuccess: () => {
      toast.success(scheduled ? `Scheduled. It appears on the website ${formatWhen(form.published_at)}.` : form.status === "published" ? "Article saved and live" : "Draft saved")
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  // Saves, then opens the article on the website in preview (drafts included).
  const preview = async () => {
    const tab = window.open("about:blank", "_blank")
    try {
      if (dirty || !savedId) await write()
      const url = await getPreviewLink(`/play/news/${form.handle}`)
      if (!url) throw new Error("Preview switches on with the next website update.")
      if (tab) tab.location.href = url
    } catch (e) {
      tab?.close()
      toast.error("Couldn't open the preview", { description: (e as Error).message })
    }
  }

  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/news/${savedId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news"] })
      toast.success("Article deleted")
      onClose()
    },
  })

  const canSave = !!form.title.trim() && !!form.handle

  return (
    <FocusModal open={open} onOpenChange={(o) => !o && close()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <div className="flex w-full items-center justify-end gap-2">
            <Text size="small" className="mr-auto text-ui-fg-subtle">
              {dirty ? "Unsaved changes" : savedId ? "All changes saved" : "New article"}
            </Text>
            <Button size="small" variant="secondary" disabled={!canSave} onClick={preview}>
              {dirty || !savedId ? "Save & preview" : "Preview"}
            </Button>
            <Button size="small" isLoading={save.isPending} disabled={!canSave || (!dirty && !!savedId)} onClick={() => save.mutate()}>
              {scheduled ? "Schedule" : form.status === "published" ? "Save & publish" : "Save draft"}
            </Button>
          </div>
        </FocusModal.Header>
        <FocusModal.Body className="flex overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-y-4">
              <FocusModal.Title asChild>
                <h1 className="sr-only">{isNew ? "New article" : "Edit article"}</h1>
              </FocusModal.Title>
              <div className="flex gap-1 self-start rounded-lg bg-ui-bg-component p-1">
                {(
                  [
                    ["write", "Write"],
                    ["seo", "SEO"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`rounded-md px-3 py-1 text-[13px] font-medium ${tab === k ? "bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest" : "text-ui-fg-subtle"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "seo" ? (
                <SeoPanel
                  value={seo}
                  onChange={setSeo}
                  defaults={{
                    title: `${form.title || "Headline"} | The 64 Squares`,
                    description: form.excerpt || form.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
                    image: form.cover_url,
                  }}
                  path={`/play/news/${form.handle || "headline"}`}
                  html={form.body_html}
                />
              ) : (
              <>
              <input
                aria-label="Headline"
                placeholder="Headline"
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value
                  setForm((f) => ({ ...f, title, handle: !savedId ? toHandle(title) : f.handle }))
                }}
                className="w-full bg-transparent text-[32px] font-bold leading-tight text-ui-fg-base outline-none placeholder:text-ui-fg-muted"
              />
              <Textarea
                aria-label="Standfirst"
                rows={2}
                placeholder="Standfirst: one or two sentences under the headline, also used on the news list (optional)"
                value={form.excerpt ?? ""}
                onChange={(e) => set("excerpt", e.target.value || null)}
              />
              <RichEditor value={form.body_html} onChange={(html) => set("body_html", html)} placeholder="Write the article…" onEditor={setEditor} />
              </>
              )}
            </div>
          </div>

          <aside className="hidden w-[340px] shrink-0 flex-col gap-y-5 overflow-y-auto border-l border-ui-border-base px-5 py-6 md:flex">
            <div className="flex items-center justify-between rounded-lg border border-ui-border-base p-3">
              <div>
                <Label>Published</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {form.status === "published" ? (scheduled ? "Scheduled" : "Visible on the website") : "Draft: only you can see it"}
                </Text>
              </div>
              <Switch checked={form.status === "published"} onCheckedChange={(v) => set("status", v ? "published" : "draft")} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="news-date">Publish date &amp; time</Label>
              <Input id="news-date" type="datetime-local" value={toLocalInput(form.published_at)} onChange={(e) => set("published_at", fromLocalInput(e.target.value))} />
              <Text size="xsmall" className={scheduled ? "text-ui-tag-blue-text" : "text-ui-fg-subtle"}>
                {scheduled ? `Scheduled: visitors see it from ${formatWhen(form.published_at)}.` : "Empty = when you publish. Pick a future time to schedule it."}
              </Text>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Top story</Label>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Shown large at the top of the news page.
                </Text>
              </div>
              <Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="news-topic">Topic</Label>
              <Input id="news-topic" list="news-topics" value={form.topic} onChange={(e) => set("topic", e.target.value.slice(0, 40))} />
              <datalist id="news-topics">
                {topics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Visitors can filter the news by topic.
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="news-author">Author</Label>
              <Input id="news-author" value={form.author} onChange={(e) => set("author", e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="news-handle">Web address</Label>
              <Input id="news-handle" value={form.handle} onChange={(e) => set("handle", toHandle(e.target.value))} />
              <Text size="xsmall" className="break-all text-ui-fg-subtle">
                the64squares.in/play/news/{form.handle || "headline"}
              </Text>
            </div>
            <ImageField
              label="Cover picture"
              allowVideo={false}
              recommended={{ width: 1600, height: 900, note: "16:9. Shown on the news list and at the top of the article." }}
              value={form.cover_url}
              onChange={(url) => set("cover_url", url)}
            />
            <LinkSuggestions editor={editor} html={form.body_html} selfPath={`/play/news/${form.handle}`} />
            {savedId && (
              <Button
                variant="danger"
                size="small"
                className="mt-auto"
                onClick={async () => {
                  if (await prompt({ title: "Delete this article?", description: "It is removed from the website." })) remove.mutate()
                }}
              >
                Delete article
              </Button>
            )}
          </aside>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

const NewsPage = () => {
  const [editing, setEditing] = useState<Article | null>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => sdk.client.fetch<{ articles: Article[] }>("/admin/news"),
  })
  const topics = useMemo(() => [...new Set([...TOPICS, ...(data?.articles ?? []).map((a) => a.topic)])], [data])

  const openEditor = (a: Article | null) => {
    setEditing(a)
    setOpen(true)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">News</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Articles for News in the Play area (/play/news), written like a Word document. Newest first; a top story shows large. Published articles appear within about 15 seconds.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <PageActions path="/play/news" />
          <Button size="small" onClick={() => openEditor(null)}>
            Write an article
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : !data?.articles.length ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">No articles yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Article</Table.HeaderCell>
              <Table.HeaderCell>Topic</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.articles.map((a) => (
              <Table.Row key={a.id} className="cursor-pointer" onClick={() => openEditor(a)}>
                <Table.Cell>
                  <div className="flex items-center gap-x-3">
                    {a.cover_url ? <img src={a.cover_url} alt="" className="h-8 w-12 rounded object-cover" /> : <div className="h-8 w-12 rounded bg-ui-bg-component" />}
                    <span className="line-clamp-1">{a.title}</span>
                    {a.featured && (
                      <Badge color="orange" size="2xsmall">
                        Top story
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>{a.topic}</Table.Cell>
                <Table.Cell>
                  {a.status === "published" && isFuture(a.published_at) ? (
                    <Badge color="blue" size="2xsmall">
                      Scheduled
                    </Badge>
                  ) : (
                    <Badge color={a.status === "published" ? "green" : "grey"} size="2xsmall">
                      {a.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell>{formatDate(a.published_at)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <ArticleEditor article={editing} open={open} onClose={() => setOpen(false)} topics={topics} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "News",
  rank: 3,
})

export default NewsPage
