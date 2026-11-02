import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight, MagnifyingGlass, Plus, Sparkles, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, Input, Label, Select, Switch, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { formatWhen } from "../../../lib/dates"
import { sdk } from "../../../lib/sdk"
import { useLeaveWarning } from "../../../lib/site-preview"
import { useMe } from "../../../lib/staff"

type QuickAction = "track" | "products" | "human" | "ask"
type Quick = { id: string; label: string; action: QuickAction; value: string }
type Faq = { id: string; question: string; answer: string; keywords: string }
type Bot = {
  enabled: boolean
  name: string
  greeting: string
  launcher_label: string
  placeholder: string
  quick: Quick[]
  faqs: Faq[]
  use_help_pages: boolean
  whatsapp: string
  whatsapp_message: string
  allow_message: boolean
  away_text: string
  ai_enabled: boolean
  ai_instructions: string
  ai_daily_limit: number
  hide_on: string[]
}
type BotResponse = {
  chatbot: Bot
  defaults: Bot
  ai_providers: { provider: "groq" | "gemini"; model: string }[]
  ai_used_today: number
}
type Reply = { text: string; source: string; products?: string[]; actions?: string[] }
type ChatRow = { id: string; last_at: string; page: string | null; count: number; first: string; last: string; ai_count: number; handed_over: boolean; unanswered: boolean }
type ChatList = { chats: ChatRow[]; count: number; offset: number; limit: number; stats: { week: number; handed_over: number; ai: number }; missed: { text: string; at: string }[] }
type ChatMsg = { role: "user" | "bot"; text: string; source?: string; at: string }

const ACTIONS: { value: QuickAction; label: string; hint: string }[] = [
  { value: "track", label: "Track my order", hint: "Shows the order number + email/phone boxes." },
  { value: "products", label: "Find furniture", hint: "The bot says the words below, then the shopper types what they want." },
  { value: "ask", label: "Ask a question", hint: "Sends the words below as if the shopper typed them." },
  { value: "human", label: "Talk to us", hint: "Shows WhatsApp and Leave a message." },
]
const SOURCE: Record<string, { label: string; color: "green" | "blue" | "purple" | "orange" | "grey" | "red" }> = {
  faq: { label: "Your answer", color: "green" },
  help: { label: "Help page", color: "green" },
  products: { label: "Product search", color: "blue" },
  ai: { label: "AI", color: "purple" },
  track: { label: "Order tracking", color: "blue" },
  human: { label: "Handed to the team", color: "orange" },
  fallback: { label: "Not sure", color: "red" },
  greeting: { label: "Hello", color: "grey" },
  thanks: { label: "Thanks", color: "grey" },
}

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`
const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function Section({ title, hint, children, action, id }: { title: string; hint?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <Container className="divide-y p-0" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="max-w-2xl">
          <Heading level="h2">{title}</Heading>
          {hint && (
            <Text size="small" className="text-ui-fg-subtle">
              {hint}
            </Text>
          )}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-y-4 px-6 py-4">{children}</div>
    </Container>
  )
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label htmlFor={htmlFor} size="small">
        {label}
      </Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

function Tools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="small" variant="transparent" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up">
        ↑
      </Button>
      <Button size="small" variant="transparent" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Move down">
        ↓
      </Button>
      <Button size="small" variant="transparent" onClick={onRemove} aria-label="Remove">
        <Trash className="text-ui-fg-error" />
      </Button>
    </div>
  )
}

// The bot's words can hold [links](/help/...) and line breaks; shown here as plain text.
function Said({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        return m ? (
          <span key={i} className="text-ui-fg-interactive underline">
            {m[1]}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      })}
    </span>
  )
}

// ------------------------------------------------------------------ try it

function TryIt() {
  const [text, setText] = useState("")
  const [log, setLog] = useState<{ q: string; r: Reply }[]>([])
  const ask = useMutation({
    mutationFn: (q: string) => sdk.client.fetch<{ reply: Reply }>("/admin/chatbot/try", { method: "POST", body: { text: q } }),
    onSuccess: (r, q) => setLog((l) => [{ q, r: r.reply }, ...l].slice(0, 6)),
    onError: (e: Error) => toast.error("Couldn't ask", { description: e.message }),
  })
  return (
    <Section title="Try it" hint="Ask what a shopper would. Uses the saved settings (save first), even while the bubble is switched off. Not saved in Past chats.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) ask.mutate(text.trim())
        }}
      >
        <Input aria-label="Test question" placeholder="e.g. Do you deliver to Pune? / Show me study desks" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" size="small" isLoading={ask.isPending} disabled={!text.trim()}>
          Ask
        </Button>
      </form>
      {log.map(({ q, r }, i) => (
        <div key={i} data-try-answer className="flex flex-col gap-2 rounded-lg bg-ui-bg-subtle p-3">
          <Text size="small" weight="plus">
            {q}
          </Text>
          <Text size="small">
            <Said text={r.text} />
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="2xsmall" color={SOURCE[r.source]?.color ?? "grey"}>
              {SOURCE[r.source]?.label ?? r.source}
            </Badge>
            {!!r.products?.length && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Shows: {r.products.join(", ")}
              </Text>
            )}
            {r.actions?.includes("human") && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                + WhatsApp / Leave a message buttons
              </Text>
            )}
            {r.actions?.includes("track") && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                + order tracking boxes
              </Text>
            )}
          </div>
        </div>
      ))}
    </Section>
  )
}

// ------------------------------------------------------------------ past chats

function PastChats({ onAddAnswer }: { onAddAnswer: (q: string) => void }) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["chatbot-chats", filter, q, offset],
    queryFn: () => sdk.client.fetch<ChatList>("/admin/chatbot/chats", { query: { filter, q: q || undefined, offset } }),
    refetchInterval: 60_000,
  })
  const chat = useQuery({
    queryKey: ["chatbot-chat", open],
    queryFn: () => sdk.client.fetch<{ chat: { id: string; messages: ChatMsg[]; page: string | null; created_at: string } }>(`/admin/chatbot/chats/${open}`),
    enabled: !!open,
  })
  const remove = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/chatbot/chats/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatbot-chats"] })
      setOpen(null)
      toast.success("Chat deleted")
    },
  })
  return (
    <div className="flex flex-col gap-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ["Chats this week", data?.stats.week],
          ["Asked for the team", data?.stats.handed_over],
          ["Answered with AI", data?.stats.ai],
        ].map(([label, n]) => (
          <Container key={label as string} className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Heading level="h2">{n ?? "–"}</Heading>
          </Container>
        ))}
      </div>
      {!!data?.missed.length && (
        <Section title="Questions the bot couldn't answer" hint="Add an answer and the bot will know it next time.">
          <div className="flex flex-col divide-y">
            {data.missed.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Text size="small" className="truncate">
                    {m.text}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {formatWhen(m.at)}
                  </Text>
                </div>
                <Button size="small" variant="secondary" onClick={() => onAddAnswer(m.text)}>
                  <Plus />
                  Add an answer
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap gap-1">
            {[
              ["all", "All"],
              ["handed_over", "Asked for the team"],
              ["unanswered", "Not answered"],
              ["ai", "Used AI"],
            ].map(([v, l]) => (
              <Button
                key={v}
                size="small"
                variant={filter === v ? "primary" : "transparent"}
                onClick={() => {
                  setFilter(v)
                  setOffset(0)
                }}
              >
                {l}
              </Button>
            ))}
          </div>
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
            <Input
              size="small"
              type="search"
              className="w-60 pl-7"
              placeholder="Search chats"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOffset(0)
              }}
            />
          </div>
        </div>
        {isLoading ? (
          <Text size="small" className="px-6 py-4">
            Loading…
          </Text>
        ) : !data?.chats.length ? (
          <Text size="small" className="px-6 py-8 text-center text-ui-fg-subtle">
            {q || filter !== "all" ? "No chats match." : "No chats yet. They appear here once shoppers use the chat bubble."}
          </Text>
        ) : (
          data.chats.map((c) => (
            <button key={c.id} type="button" data-chat={c.id} onClick={() => setOpen(c.id)} className="flex w-full items-start gap-4 px-6 py-3 text-left hover:bg-ui-bg-base-hover">
              <div className="min-w-0 flex-1">
                <Text size="small" weight="plus" className="line-clamp-1">
                  {c.first || "(no question)"}
                </Text>
                <Text size="xsmall" className="line-clamp-1 text-ui-fg-subtle">
                  {c.count} question{c.count === 1 ? "" : "s"}
                  {c.page ? ` · on ${c.page}` : ""} · last: {c.last}
                </Text>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatWhen(c.last_at)}
                </Text>
                <div className="flex gap-1">
                  {c.handed_over && (
                    <Badge size="2xsmall" color="orange">
                      Team
                    </Badge>
                  )}
                  {c.unanswered && (
                    <Badge size="2xsmall" color="red">
                      Not answered
                    </Badge>
                  )}
                  {c.ai_count > 0 && (
                    <Badge size="2xsmall" color="purple">
                      AI
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
        {!!data && data.count > data.limit && (
          <div className="flex items-center justify-between px-6 py-3">
            <Text size="small" className="text-ui-fg-subtle">
              {offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}
            </Text>
            <div className="flex gap-2">
              <Button size="small" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - data.limit))}>
                Newer
              </Button>
              <Button size="small" variant="secondary" disabled={offset + data.limit >= data.count} onClick={() => setOffset(offset + data.limit)}>
                Older
              </Button>
            </div>
          </div>
        )}
      </Container>
      {open && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)}>
          <Drawer.Content className="max-w-[560px]">
            <Drawer.Header>
              <Drawer.Title>Chat</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2 overflow-y-auto bg-ui-bg-subtle">
              {chat.data?.chat.page && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Started on {chat.data.chat.page} · {formatWhen(chat.data.chat.created_at)}
                </Text>
              )}
              {(chat.data?.chat.messages ?? []).map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 txt-small ${m.role === "user" ? "bg-ui-fg-base text-ui-fg-on-inverted" : "bg-ui-bg-base shadow-borders-base"}`}>
                    <Said text={m.text} />
                  </div>
                  <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                    {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    {m.source && SOURCE[m.source] ? ` · ${SOURCE[m.source].label}` : ""}
                  </Text>
                  {m.source === "fallback" && i > 0 && chat.data?.chat.messages[i - 1]?.role === "user" && (
                    <Button
                      size="small"
                      variant="transparent"
                      onClick={() => {
                        onAddAnswer(chat.data!.chat.messages[i - 1].text)
                        setOpen(null)
                      }}
                    >
                      <Plus />
                      Add an answer for this
                    </Button>
                  )}
                </div>
              ))}
            </Drawer.Body>
            <Drawer.Footer>
              <Button
                variant="danger"
                className="mr-auto"
                onClick={async () => {
                  if (await prompt({ title: "Delete this chat?", description: "It can't be brought back.", confirmText: "Delete" })) remove.mutate(open)
                }}
              >
                <Trash />
                Delete
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ settings

function Settings({ data, focusFaq, onFocused }: { data: BotResponse; focusFaq: string | null; onFocused: () => void }) {
  const qc = useQueryClient()
  const [b, setB] = useState<Bot>(data.chatbot)
  const [saved, setSaved] = useState(JSON.stringify(data.chatbot))
  const [faqSearch, setFaqSearch] = useState("")
  const [hideText, setHideText] = useState(data.chatbot.hide_on.join("\n"))
  useEffect(() => {
    setB(data.chatbot)
    setSaved(JSON.stringify(data.chatbot))
    setHideText(data.chatbot.hide_on.join("\n"))
  }, [data])
  // "Add an answer" from Past chats: a new answer with that question, ready to fill in.
  useEffect(() => {
    if (!focusFaq) return
    const id = newId("f")
    setB((x) => ({ ...x, faqs: [{ id, question: focusFaq.slice(0, 200), answer: "", keywords: "" }, ...x.faqs] }))
    setFaqSearch("")
    setTimeout(() => (document.getElementById(`faq-answer-${id}`) as HTMLTextAreaElement | null)?.focus(), 100)
    onFocused()
  }, [focusFaq])
  const dirty = JSON.stringify(b) !== saved
  useLeaveWarning(dirty)
  const set = (patch: Partial<Bot>) => setB({ ...b, ...patch })
  const setQuick = (i: number, patch: Partial<Quick>) => set({ quick: b.quick.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const setFaq = (id: string, patch: Partial<Faq>) => set({ faqs: b.faqs.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const save = useMutation({
    mutationFn: (body: Bot) => sdk.client.fetch<BotResponse>("/admin/chatbot", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["chatbot"], r)
      toast.success("Saved. The website shows it within a minute or two.")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })

  const problems: string[] = []
  if (!b.name.trim()) problems.push("The bot needs a name.")
  if (!b.greeting.trim()) problems.push("Write a greeting.")
  b.quick.forEach((x) => !x.label.trim() && problems.push("Every button needs words."))
  b.quick.forEach((x) => x.action === "ask" && !x.value.trim() && problems.push(`The "${x.label}" button needs a question to ask.`))
  b.faqs.forEach((f) => (!f.question.trim() || !f.answer.trim()) && problems.push(`Fill in the question and answer of "${f.question || "a new answer"}", or remove it.`))
  if (b.whatsapp && !/^[+\d\s()-]{6,20}$/.test(b.whatsapp)) problems.push("Check the WhatsApp number.")
  const hideBad = hideText.split("\n").map((x) => x.trim()).filter(Boolean).some((x) => !/^\/[\w\-/]*$/.test(x))
  if (hideBad) problems.push("Each hidden page must start with /, e.g. /checkout")

  const faqs = useMemo(() => {
    const s = faqSearch.trim().toLowerCase()
    return s ? b.faqs.filter((f) => `${f.question} ${f.answer} ${f.keywords}`.toLowerCase().includes(s)) : b.faqs
  }, [b.faqs, faqSearch])
  const ai = data.ai_providers

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Switch id="bot-on" checked={b.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          <div>
            <Label htmlFor="bot-on" weight="plus">
              Show the chat bubble on the website
            </Label>
            <Text size="small" className="text-ui-fg-subtle">
              {b.enabled ? "On: a round chat button sits at the bottom right of every page." : "Off: shoppers don't see it. Check the answers below, try it, then switch it on."}
            </Text>
          </div>
        </div>
        <Badge color={b.enabled ? "green" : "grey"}>{b.enabled ? "On" : "Off"}</Badge>
      </Container>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-y-3">
          <Section title="Look & words">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Bot's name" htmlFor="bot-name" hint="Shown at the top of the chat.">
                <Input id="bot-name" value={b.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Words on the chat button" htmlFor="bot-launcher" hint="Shown on the chat button at the bottom right. Leave empty for just the round chat icon.">
                <Input id="bot-launcher" value={b.launcher_label} onChange={(e) => set({ launcher_label: e.target.value })} />
              </Field>
            </div>
            <Field label="First message" htmlFor="bot-greeting">
              <Textarea id="bot-greeting" rows={2} value={b.greeting} onChange={(e) => set({ greeting: e.target.value })} />
            </Field>
            <Field label="Words in the empty typing box" htmlFor="bot-placeholder">
              <Input id="bot-placeholder" value={b.placeholder} onChange={(e) => set({ placeholder: e.target.value })} />
            </Field>
          </Section>

          <Section
            title="Quick buttons"
            hint="Shown under the first message, so shoppers can tap instead of typing."
            action={
              <Button size="small" variant="secondary" disabled={b.quick.length >= 8} onClick={() => set({ quick: [...b.quick, { id: newId("q"), label: "", action: "ask", value: "" }] })}>
                <Plus />
                Add a button
              </Button>
            }
          >
            {b.quick.map((x, i) => (
              <div key={x.id} data-quick-row className="flex flex-col gap-3 rounded-lg bg-ui-bg-subtle p-3">
                <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_200px_auto]">
                  <Field label="Button words">
                    <Input size="small" aria-label="Button words" value={x.label} onChange={(e) => setQuick(i, { label: e.target.value })} />
                  </Field>
                  <Field label="What it does">
                    <Select size="small" value={x.action} onValueChange={(v) => setQuick(i, { action: v as QuickAction })}>
                      <Select.Trigger aria-label="What it does">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {ACTIONS.map((a) => (
                          <Select.Item key={a.value} value={a.value}>
                            {a.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Field>
                  <Tools i={i} n={b.quick.length} onMove={(d) => set({ quick: move(b.quick, i, d) })} onRemove={() => set({ quick: b.quick.filter((_, j) => j !== i) })} />
                </div>
                {(x.action === "ask" || x.action === "products") && (
                  <Field label={x.action === "ask" ? "Question it asks" : "What the bot says"} hint={ACTIONS.find((a) => a.value === x.action)?.hint}>
                    <Input size="small" aria-label={x.action === "ask" ? "Question it asks" : "What the bot says"} value={x.value} onChange={(e) => setQuick(i, { value: e.target.value })} />
                  </Field>
                )}
              </div>
            ))}
          </Section>

          <Section
            id="answers"
            title="Answers"
            hint={
              <>
                The bot answers these straight away, for free. It also knows every question on your{" "}
                <Link to="/website/help-pages" className="text-ui-fg-interactive hover:underline">
                  Help pages
                </Link>{" "}
                (each “## ” heading is a question) and your products.
              </>
            }
            action={
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  const id = newId("f")
                  set({ faqs: [{ id, question: "", answer: "", keywords: "" }, ...b.faqs] })
                  setFaqSearch("")
                  setTimeout(() => document.getElementById(`faq-q-${id}`)?.focus(), 50)
                }}
              >
                <Plus />
                Add an answer
              </Button>
            }
          >
            <div className="flex items-center gap-3">
              <Switch id="bot-help" checked={b.use_help_pages} onCheckedChange={(v) => set({ use_help_pages: v })} />
              <Label htmlFor="bot-help" size="small">
                Also answer from the Help pages (FAQs, Delivery & assembly, Returns & warranty…)
              </Label>
            </div>
            {b.faqs.length > 4 && <Input size="small" type="search" placeholder="Search your answers" value={faqSearch} onChange={(e) => setFaqSearch(e.target.value)} />}
            {faqs.map((f) => {
              const i = b.faqs.indexOf(f)
              return (
                <div key={f.id} data-faq-row className="flex flex-col gap-3 rounded-lg bg-ui-bg-subtle p-3">
                  <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto]">
                    <Field label="Question" htmlFor={`faq-q-${f.id}`}>
                      <Input id={`faq-q-${f.id}`} size="small" value={f.question} onChange={(e) => setFaq(f.id, { question: e.target.value })} placeholder="e.g. Do you deliver to my city?" />
                    </Field>
                    <Tools i={i} n={b.faqs.length} onMove={(d) => set({ faqs: move(b.faqs, i, d) })} onRemove={() => set({ faqs: b.faqs.filter((x) => x.id !== f.id) })} />
                  </div>
                  <Field
                    label="Answer"
                    htmlFor={`faq-answer-${f.id}`}
                    hint="Links: [Delivery](/help/delivery). {delivery} puts in your delivery line from Settings."
                  >
                    <Textarea id={`faq-answer-${f.id}`} rows={3} value={f.answer} onChange={(e) => setFaq(f.id, { answer: e.target.value })} />
                  </Field>
                  <Field label="Other words people use (optional)" hint="Helps the bot match, e.g. ship courier arrive days.">
                    <Input size="small" aria-label="Other words" value={f.keywords} onChange={(e) => setFaq(f.id, { keywords: e.target.value })} />
                  </Field>
                </div>
              )
            })}
            {!b.faqs.length && (
              <Text size="small" className="text-ui-fg-subtle">
                No answers of your own yet.
              </Text>
            )}
          </Section>

          <Section title="Talking to a person" hint="When the bot can't help, or the shopper asks for someone.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="WhatsApp number" htmlFor="bot-wa" hint="Leave empty to use the one on the Contact page.">
                <Input id="bot-wa" placeholder="+91 98765 43210" value={b.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
              </Field>
              <Field label="Message typed in for them" htmlFor="bot-wa-msg">
                <Input id="bot-wa-msg" value={b.whatsapp_message} onChange={(e) => set({ whatsapp_message: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="bot-msg" checked={b.allow_message} onCheckedChange={(v) => set({ allow_message: v })} />
              <Label htmlFor="bot-msg" size="small">
                Let shoppers leave a message (it arrives in Messages → Contact form, with the chat, and by email)
              </Label>
            </div>
            {b.allow_message && (
              <Field label="Words above the message form" htmlFor="bot-away">
                <Input id="bot-away" value={b.away_text} onChange={(e) => set({ away_text: e.target.value })} />
              </Field>
            )}
          </Section>

          <Section
            title="AI answers (free)"
            hint="For questions the answers above don't cover. The AI only uses your answers, Help pages and products, and never sees names, emails, phone numbers or order numbers."
          >
            <div className="flex items-center gap-3">
              <Switch id="bot-ai" checked={b.ai_enabled} onCheckedChange={(v) => set({ ai_enabled: v })} />
              <Label htmlFor="bot-ai" size="small">
                Use AI when the bot has no ready answer
              </Label>
            </div>
            <div className={`flex items-start gap-2 rounded-lg p-3 ${ai.length ? "bg-ui-tag-green-bg" : "bg-ui-tag-orange-bg"}`} data-ai-status>
              <Sparkles className={ai.length ? "text-ui-tag-green-icon" : "text-ui-tag-orange-icon"} />
              <Text size="small">
                {ai.length ? (
                  <>
                    Ready: {ai.map((p) => `${p.provider === "groq" ? "Groq" : "Gemini"} (${p.model})`).join(", then ")}. Used {data.ai_used_today} time
                    {data.ai_used_today === 1 ? "" : "s"} today.
                  </>
                ) : (
                  <>
                    No AI key yet, so the bot answers only from your answers, Help pages and products. Add a free Groq or Gemini key in{" "}
                    <Link to="/settings/payments" className="text-ui-fg-interactive underline">
                      Settings → Payments &amp; delivery → Keys
                    </Link>{" "}
                    (main admin).
                  </>
                )}
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
              <Field label="AI answers per day, at most" htmlFor="bot-limit" hint="Keeps you inside the free plan. After this, the bot offers the team instead.">
                <Input id="bot-limit" type="number" min={0} value={String(b.ai_daily_limit)} onChange={(e) => set({ ai_daily_limit: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </Field>
              <Field label="Extra notes for the AI (optional)" htmlFor="bot-notes" hint="Facts or tone, e.g. “We're a small family workshop in Jaipur. Always friendly, never pushy.”">
                <Textarea id="bot-notes" rows={3} value={b.ai_instructions} onChange={(e) => set({ ai_instructions: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Pages without the bubble" hint="One per line. Any page starting with these is left out.">
            <Textarea
              aria-label="Pages without the bubble"
              rows={3}
              value={hideText}
              onChange={(e) => {
                setHideText(e.target.value)
                set({ hide_on: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })
              }}
            />
          </Section>
        </div>
        <div className="xl:sticky xl:top-3 xl:self-start">
          <TryIt />
        </div>
      </div>

      <div className="sticky bottom-0 z-10">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-elevation-card-hover">
          <Text size="small" className={problems.length ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
            {problems[0] ?? (dirty ? "You have unsaved changes." : "All changes saved.")}
          </Text>
          <div className="flex gap-x-2">
            <Button
              size="small"
              variant="transparent"
              onClick={() => {
                setB({ ...data.defaults, enabled: b.enabled })
                setHideText(data.defaults.hide_on.join("\n"))
              }}
            >
              Reset to original
            </Button>
            {dirty && (
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  const back = JSON.parse(saved) as Bot
                  setB(back)
                  setHideText(back.hide_on.join("\n"))
                }}
              >
                Undo changes
              </Button>
            )}
            <Button size="small" disabled={!dirty || problems.length > 0} isLoading={save.isPending} onClick={() => save.mutate(b)}>
              Save
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}

const ChatbotPage = () => {
  const { can } = useMe()
  const [params, setParams] = useSearchParams()
  const canEdit = can("content.chatbot")
  const canChats = can("messages.view")
  const tab = (params.get("tab") === "chats" && canChats) || !canEdit ? "chats" : "settings"
  const [focusFaq, setFocusFaq] = useState<string | null>(null)
  const { data } = useQuery({ queryKey: ["chatbot"], queryFn: () => sdk.client.fetch<BotResponse>("/admin/chatbot"), enabled: canEdit })
  const go = (t: "settings" | "chats") => {
    const next = new URLSearchParams(params)
    if (t === "chats") next.set("tab", "chats")
    else next.delete("tab")
    setParams(next, { replace: true })
  }
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="max-w-2xl">
          <Heading level="h1">Chat bot</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            A help bubble on the website. It answers from your answers, Help pages and products for free, tracks orders, uses a free AI for the
            rest, and hands over to WhatsApp or a message when it can't help.
          </Text>
        </div>
        <div className="flex gap-1">
          {canEdit && (
            <Button size="small" variant={tab === "settings" ? "primary" : "secondary"} onClick={() => go("settings")}>
              Settings
            </Button>
          )}
          {canChats && (
            <Button size="small" variant={tab === "chats" ? "primary" : "secondary"} onClick={() => go("chats")}>
              <ChatBubbleLeftRight />
              Past chats
            </Button>
          )}
        </div>
      </Container>
      {tab === "chats" ? (
        <PastChats
          onAddAnswer={(q) => {
            if (!canEdit) return toast.info("Ask the main admin to add an answer for this.")
            setFocusFaq(q)
            go("settings")
          }}
        />
      ) : data ? (
        <Settings data={data} focusFaq={focusFaq} onFocused={() => setFocusFaq(null)} />
      ) : (
        <Container className="px-6 py-4">
          <Text size="small">Loading…</Text>
        </Container>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Chat bot",
  icon: ChatBubbleLeftRight,
  rank: 6,
})

export default ChatbotPage
