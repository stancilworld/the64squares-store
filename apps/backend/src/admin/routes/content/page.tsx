import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { Alert, Badge, Button, Container, Copy, Heading, Input, Label, Select, Table, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/sdk"

// Content: plan articles on a calendar, keep ideas (some found from what people search for),
// see how each article does, and draft with the AI helper.

type Kind = "blog" | "news" | "social" | "other"
type Idea = { id?: string; title: string; notes: string; date: string | null; kind: Kind; status: "idea" | "writing" | "done"; source: string | null; created_at?: string }
type Article = { id: string; kind: "blog" | "news"; title: string; path: string; edit: string; status: "draft" | "published" | "scheduled"; published_at: string | null; updated_at: string }
type Hub = { articles: Article[]; ideas: Idea[]; ai_connected: boolean }

const KIND_LABEL: Record<Kind, string> = { blog: "Blog post", news: "News", social: "Social post", other: "Other" }
const KIND_COLOUR: Record<Kind, "blue" | "purple" | "orange" | "grey"> = { blog: "blue", news: "purple", social: "orange", other: "grey" }
const KIND_BG: Record<Kind, string> = { blog: "bg-ui-tag-blue-bg", news: "bg-ui-tag-purple-bg", social: "bg-ui-tag-orange-bg", other: "bg-ui-tag-neutral-bg" }

const useHub = () => useQuery({ queryKey: ["content-hub"], queryFn: () => sdk.client.fetch<Hub>("/admin/content-hub") })

const useSaveIdeas = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ideas: Idea[]) => sdk.client.fetch<{ ideas: Idea[] }>("/admin/content-hub/ideas", { method: "POST", body: { ideas } }),
    onSuccess: (r) => qc.setQueryData<Hub>(["content-hub"], (old) => (old ? { ...old, ideas: r.ideas } : old)),
    onError: (e: Error) => toast.error("Couldn't save the ideas", { description: e.message }),
  })
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function Calendar() {
  const { data } = useHub()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const byDay = useMemo(() => {
    const m = new Map<string, { label: string; kind: Kind; to: string | null; faded: boolean }[]>()
    const add = (k: string, v: { label: string; kind: Kind; to: string | null; faded: boolean }) => m.set(k, [...(m.get(k) ?? []), v])
    for (const a of data?.articles ?? []) if (a.published_at) add(dayKey(new Date(a.published_at)), { label: a.title, kind: a.kind, to: a.edit, faded: false })
    for (const i of data?.ideas ?? []) if (i.date && i.status !== "done") add(i.date, { label: `Planned: ${i.title}`, kind: i.kind, to: null, faded: true })
    return m
  }, [data])
  const first = new Date(month)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const today = dayKey(new Date())
  const drafts = (data?.articles ?? []).filter((a) => a.status === "draft")
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <Text weight="plus">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            Previous
          </Button>
          <Button size="small" variant="secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            This month
          </Button>
          <Button size="small" variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            Next
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-lg border text-[12px]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b bg-ui-bg-subtle px-2 py-1 text-ui-fg-subtle">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d)
          const items = byDay.get(k) ?? []
          const inMonth = d.getMonth() === month.getMonth()
          return (
            <div key={k} className={`min-h-[92px] border-b border-r p-1.5 ${inMonth ? "" : "bg-ui-bg-subtle text-ui-fg-muted"}`}>
              <div className={`mb-1 inline-block rounded px-1 ${k === today ? "bg-ui-fg-interactive text-white" : ""}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {items.slice(0, 3).map((it, i) => {
                  const cls = `block truncate rounded px-1.5 py-0.5 ${it.faded ? "border border-dashed" : KIND_BG[it.kind]}`
                  return it.to ? (
                    <Link key={i} to={it.to} className={`${cls} hover:underline`} title={it.label}>
                      {it.label}
                    </Link>
                  ) : (
                    <span key={i} className={cls} title={it.label}>
                      {it.label}
                    </span>
                  )
                })}
                {items.length > 3 && <span className="text-ui-fg-muted">+{items.length - 3} more</span>}
              </div>
            </div>
          )
        })}
      </div>
      <Text size="xsmall" className="mt-2 text-ui-fg-muted">
        Published and scheduled articles show on their date; planned ideas (from the Ideas tab) show with a dashed border.
      </Text>
      {drafts.length > 0 && (
        <div className="mt-6">
          <Text size="small" weight="plus">
            Drafts
          </Text>
          <ul className="mt-2 space-y-1">
            {drafts.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-[13px]">
                <Badge size="2xsmall" color={KIND_COLOUR[a.kind]}>
                  {KIND_LABEL[a.kind]}
                </Badge>
                <Link to={a.edit} className="hover:underline">
                  {a.title}
                </Link>
                <span className="text-ui-fg-muted">· last edited {new Date(a.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const EMPTY: Idea = { title: "", notes: "", date: null, kind: "blog", status: "idea", source: null }

function Ideas() {
  const { data } = useHub()
  const save = useSaveIdeas()
  const ideas = data?.ideas ?? []
  const [draft, setDraft] = useState<Idea>(EMPTY)
  const sources = useQuery({
    queryKey: ["content-idea-sources"],
    queryFn: () =>
      sdk.client.fetch<{
        nothing_found: { term: string; searches: number }[]
        most_searched: { term: string; searches: number }[]
        google: { query: string; impressions: number; clicks: number; position: number }[]
        google_connected: boolean
      }>("/admin/content-hub/idea-sources"),
  })
  const add = (i: Idea) => {
    save.mutate([{ ...i, title: i.title.trim() }, ...ideas], { onSuccess: () => toast.success("Idea added") })
  }
  const update = (id: string | undefined, patch: Partial<Idea>) => save.mutate(ideas.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const remove = (id: string | undefined) => save.mutate(ideas.filter((x) => x.id !== id))
  const have = new Set(ideas.map((i) => (i.source ?? "").toLowerCase()))

  const SourceList = ({ title, note, rows, prefix }: { title: string; note: string; rows: { term: string; extra: string }[]; prefix: string }) => (
    <div className="min-w-0">
      <Text size="small" weight="plus">
        {title}
      </Text>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {note}
      </Text>
      {rows.length ? (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 12).map((r) => {
            const src = `${prefix}: ${r.term}`
            return (
              <li key={r.term} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">
                  {r.term} <span className="text-ui-fg-muted">· {r.extra}</span>
                </span>
                {have.has(src.toLowerCase()) ? (
                  <Text size="xsmall" className="shrink-0 text-ui-fg-muted">
                    Added
                  </Text>
                ) : (
                  <Button size="small" variant="transparent" className="shrink-0" onClick={() => add({ ...EMPTY, title: r.term, source: src })}>
                    Add idea
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <Text size="xsmall" className="mt-2 text-ui-fg-muted">
          Nothing yet.
        </Text>
      )}
    </div>
  )

  return (
    <div className="px-6 py-4">
      <form
        className="grid gap-2 rounded-lg border bg-ui-bg-subtle p-3 md:grid-cols-[1fr_150px_150px_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.title.trim()) return
          add(draft)
          setDraft(EMPTY)
        }}
      >
        <Input size="small" placeholder="New idea, e.g. How to choose your first wooden chess set" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <Select size="small" value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Kind })}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <Select.Item key={k} value={k}>
                {KIND_LABEL[k]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Input size="small" type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} aria-label="Planned day" />
        <Button size="small" type="submit" disabled={!draft.title.trim() || save.isPending}>
          Add idea
        </Button>
      </form>

      {ideas.length > 0 && (
        <div className="-mx-6 mt-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Idea</Table.HeaderCell>
                <Table.HeaderCell>Kind</Table.HeaderCell>
                <Table.HeaderCell>Planned</Table.HeaderCell>
                <Table.HeaderCell>Stage</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {ideas.map((i) => (
                <Table.Row key={i.id} className={i.status === "done" ? "opacity-60" : ""}>
                  <Table.Cell className="max-w-[360px]">
                    <div className="truncate">{i.title}</div>
                    {i.source && <div className="truncate text-[11px] text-ui-fg-muted">From {i.source}</div>}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={KIND_COLOUR[i.kind]}>
                      {KIND_LABEL[i.kind]}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <input type="date" value={i.date ?? ""} onChange={(e) => update(i.id, { date: e.target.value || null })} className="rounded border bg-transparent px-1 text-[12px]" aria-label="Planned day" />
                  </Table.Cell>
                  <Table.Cell>
                    <select value={i.status} onChange={(e) => update(i.id, { status: e.target.value as Idea["status"] })} className="rounded border bg-transparent px-1 text-[12px]" aria-label="Stage">
                      <option value="idea">Idea</option>
                      <option value="writing">Writing</option>
                      <option value="done">Done</option>
                    </select>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button size="small" variant="transparent" onClick={() => remove(i.id)}>
                      Remove
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      <div className="mt-8">
        <Text weight="plus">Ideas from what people look for</Text>
        <div className="mt-3 grid gap-6 lg:grid-cols-3">
          <SourceList
            title="Shop searches that found nothing"
            note="Last 90 days. A product, a guide, or a better product name could answer these."
            rows={(sources.data?.nothing_found ?? []).map((r) => ({ term: r.term, extra: `${r.searches}×` }))}
            prefix="Search with no results"
          />
          <SourceList
            title="Most searched in the shop"
            note="Last 90 days. Buying guides and comparisons for these do well."
            rows={(sources.data?.most_searched ?? []).map((r) => ({ term: r.term, extra: `${r.searches}×` }))}
            prefix="Shop search"
          />
          {sources.data?.google_connected ? (
            <SourceList
              title="Google searches where you're low on the page"
              note="Last 28 days. The site shows up but below the top 5: an article on the topic can lift it."
              rows={(sources.data?.google ?? []).map((r) => ({ term: r.query, extra: `${r.impressions} views, position ${r.position.toFixed(0)}` }))}
              prefix="Google"
            />
          ) : (
            <div>
              <Text size="small" weight="plus">
                Google searches
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Connect Google Search Console in{" "}
                <Link to="/seo" className="text-ui-fg-interactive hover:underline">
                  SEO
                </Link>{" "}
                to see what people search on Google before finding the site.
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type Perf = {
  google_connected: boolean
  google_error: string | null
  articles: (Article & { views: number; visits: number; google: { clicks: number; impressions: number; position: number } | null })[]
}

function Performance() {
  const [days, setDays] = useState("30")
  const { data, isLoading } = useQuery({ queryKey: ["content-perf", days], queryFn: () => sdk.client.fetch<Perf>(`/admin/content-hub/performance?days=${days}`) })
  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-3 px-6">
        <Text size="small" className="text-ui-fg-subtle">
          Visits are counted by the store itself.{" "}
          {data?.google_connected ? "Google numbers come from Search Console." : "Connect Google Search Console in SEO to add Google numbers."}
        </Text>
        <Select size="small" value={days} onValueChange={setDays}>
          <Select.Trigger className="w-[150px]">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="7">Last 7 days</Select.Item>
            <Select.Item value="30">Last 30 days</Select.Item>
            <Select.Item value="90">Last 90 days</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {data?.google_error && <Alert className="mx-6 mt-3">Google: {data.google_error}</Alert>}
      {isLoading ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">Loading…</Text>
      ) : !data?.articles.length ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">No published articles yet.</Text>
      ) : (
        <div className="mt-3">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Article</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Views</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Visits</Table.HeaderCell>
                {data.google_connected && (
                  <>
                    <Table.HeaderCell className="text-right">Google clicks</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Shown on Google</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Position</Table.HeaderCell>
                  </>
                )}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.articles.map((a) => (
                <Table.Row key={a.id}>
                  <Table.Cell className="max-w-[380px]">
                    <div className="flex items-center gap-2">
                      <Badge size="2xsmall" color={KIND_COLOUR[a.kind]}>
                        {KIND_LABEL[a.kind]}
                      </Badge>
                      <Link to={a.edit} className="truncate hover:underline">
                        {a.title}
                      </Link>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{a.views.toLocaleString("en-IN")}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{a.visits.toLocaleString("en-IN")}</Table.Cell>
                  {data.google_connected && (
                    <>
                      <Table.Cell className="text-right tabular-nums">{a.google ? a.google.clicks : "–"}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{a.google ? a.google.impressions : "–"}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{a.google ? a.google.position.toFixed(1) : "–"}</Table.Cell>
                    </>
                  )}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </div>
  )
}

const TASKS = [
  { value: "titles", label: "Title ideas" },
  { value: "outline", label: "Outline" },
  { value: "intro", label: "Opening paragraph" },
  { value: "meta", label: "Google description" },
  { value: "faq", label: "Questions & answers" },
  { value: "social", label: "Social posts" },
  { value: "improve", label: "Improve my text" },
]

function Helper({ connected }: { connected: boolean }) {
  const [task, setTask] = useState("outline")
  const [topic, setTopic] = useState("")
  const [keyword, setKeyword] = useState("")
  const [text, setText] = useState("")
  const run = useMutation({
    mutationFn: () => sdk.client.fetch<{ text: string }>("/admin/content-hub/assist", { method: "POST", body: { task, topic, keyword: keyword || undefined, text: text || undefined } }),
    onError: (e: Error) => toast.error("No draft", { description: e.message }),
  })
  if (!connected) {
    return (
      <div className="px-6 py-4">
        <Alert>
          The writing helper isn&apos;t connected yet. It uses the same free AI as the chat bot: add a Groq or Google Gemini key in{" "}
          <Link to="/settings/payments" className="text-ui-fg-interactive underline">
            Settings → Payments &amp; delivery → Keys
          </Link>{" "}
          (main admin). Both have free plans.
        </Alert>
      </div>
    )
  }
  return (
    <div className="grid gap-6 px-6 py-4 lg:grid-cols-2">
      <form
        className="grid content-start gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          run.mutate()
        }}
      >
        <div>
          <Label size="small">What do you need?</Label>
          <Select size="small" value={task} onValueChange={setTask}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {TASKS.map((t) => (
                <Select.Item key={t.value} value={t.value}>
                  {t.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div>
          <Label size="small">Topic</Label>
          <Input size="small" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Choosing a tournament-size chess set for a school club" />
        </div>
        <div>
          <Label size="small">Main keyword (optional)</Label>
          <Input size="small" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="tournament chess set" />
        </div>
        {task === "improve" && (
          <div>
            <Label size="small">Your text</Label>
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <div>
          <Button size="small" type="submit" disabled={topic.trim().length < 3 || (task === "improve" && !text.trim()) || run.isPending}>
            {run.isPending ? "Writing…" : "Write a draft"}
          </Button>
        </div>
        <Text size="xsmall" className="text-ui-fg-muted">
          A starting point, not a finished article: check facts and prices, and add your own experience.
        </Text>
      </form>
      <div>
        <div className="flex items-center justify-between">
          <Label size="small">Draft</Label>
          {run.data?.text && <Copy content={run.data.text} />}
        </div>
        <div className="mt-1 min-h-[280px] whitespace-pre-wrap rounded-lg border bg-ui-bg-subtle p-4 text-[14px] leading-relaxed">
          {run.data?.text ?? <span className="text-ui-fg-muted">The draft appears here.</span>}
        </div>
      </div>
    </div>
  )
}

const ContentPage = () => {
  const [tab, setTab] = useState("calendar")
  const { data } = useHub()
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <Heading>Content</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Plan, find ideas, check results, and draft. Write the articles in{" "}
            <Link to="/website/blog" className="text-ui-fg-interactive hover:underline">
              Blog
            </Link>{" "}
            and{" "}
            <Link to="/website/news" className="text-ui-fg-interactive hover:underline">
              News
            </Link>
            .
          </Text>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List className="border-b px-6">
          <Tabs.Trigger value="calendar">Calendar</Tabs.Trigger>
          <Tabs.Trigger value="ideas">Ideas</Tabs.Trigger>
          <Tabs.Trigger value="performance">How articles do</Tabs.Trigger>
          <Tabs.Trigger value="helper">Writing helper</Tabs.Trigger>
        </Tabs.List>
        <div className="pb-4">
          <Tabs.Content value="calendar">
            <Calendar />
          </Tabs.Content>
          <Tabs.Content value="ideas">
            <Ideas />
          </Tabs.Content>
          <Tabs.Content value="performance">
            <Performance />
          </Tabs.Content>
          <Tabs.Content value="helper">
            <Helper connected={!!data?.ai_connected} />
          </Tabs.Content>
        </div>
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Content", icon: DocumentText, rank: 6 })

export default ContentPage
