import {
  ArrowDownTray,
  ArrowPath,
  ArrowUturnLeft,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EllipsisHorizontal,
  Envelope,
  EnvelopeSolid,
  InboxSolid,
  Keyboard,
  MagnifyingGlass,
  PaperClip,
  PaperPlane,
  PencilSquare,
  SquareTwoStack,
  Star,
  StarSolid,
  Trash,
  Users,
  XMarkMini,
} from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Drawer, Heading, IconButton, Input, Kbd, Label, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useContextMenu, type MenuItem } from "./context-menu"
import { formatWhen } from "./dates"
import { BACKEND_URL, sdk } from "./sdk"

// Messages → Email: the shop's mailbox (e.g. hello@the64squares.in) inside the admin, made to feel
// like Gmail: folders on the left, a right-click menu on every conversation and email, quick
// buttons when the mouse is over a row, ticking several at once, Undo, and keyboard keys.

type Address = { name: string; address: string }
type Attachment = { index: number; filename: string; content_type: string; size: number }
export type Mail = {
  id: string
  folder: "inbox" | "sent"
  thread_id: string
  from_name: string | null
  from_email: string | null
  reply_to: string | null
  to: Address[]
  cc: Address[] | null
  subject: string | null
  text: string | null
  html: string | null
  snippet: string | null
  date: string
  status: "new" | "read" | "done"
  starred: boolean
  note: string | null
  attachments: Attachment[] | null
  sent_by: string | null
  message_id: string | null
}
type Thread = {
  id: string
  subject: string
  name: string
  email: string
  count: number
  last_date: string
  snippet: string
  state: "new" | "open" | "done" | "sent"
  unread: number
  starred: boolean
  has_attachments: boolean
  last_from_us: boolean
}
type Customer = {
  id: string | null
  name: string | null
  phone: string | null
  email: string
  orders: { id: string; display_id: number; created_at: string; status: string; total: number; currency_code: string }[]
}
type Status = { connected: boolean; email: string | null; last_sync_at: string | null; last_error: string | null; unread: number }
type ThreadList = { threads: Thread[]; count: number; offset: number; limit: number; counts: { new: number; inbox: number; starred: number } }
type Action = "read" | "unread" | "done" | "inbox" | "star" | "unstar" | "delete"
type Folder = "inbox" | "unread" | "starred" | "done" | "sent" | "all"
export type ComposeMode = "new" | "reply" | "replyAll" | "forward"

const FOLDERS: { value: Folder; label: string; icon: ReactNode; empty: string }[] = [
  { value: "inbox", label: "Inbox", icon: <InboxSolid />, empty: "All caught up. No emails waiting for a reply." },
  { value: "unread", label: "Unread", icon: <EnvelopeSolid />, empty: "No unread emails." },
  { value: "starred", label: "Starred", icon: <Star />, empty: "Nothing starred. Star an email (S) to find it here again." },
  { value: "done", label: "Answered", icon: <CheckCircle />, empty: "Nothing answered yet." },
  { value: "sent", label: "Sent", icon: <PaperPlane />, empty: "Nothing sent yet." },
  { value: "all", label: "All mail", icon: <Envelope />, empty: "No emails yet." },
]

const ForwardIcon = () => <ArrowUturnLeft className="-scale-x-100" />

// ------------------------------------------------------------------ small helpers

const ago = (iso: string | null) => {
  if (!iso) return "never"
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return formatWhen(iso)
}
// Like Gmail: the time today, the day this year, the full date before that.
const shortDate = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" })
}
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount)
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const t = document.createElement("textarea")
    t.value = text
    document.body.appendChild(t)
    t.select()
    document.execCommand("copy")
    t.remove()
  }
  toast.success(`${what} copied`)
}

// Typing in a box shouldn't trigger the keyboard shortcuts.
const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (document.querySelector("[role=alertdialog]")) return true
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[role=menu]"))
}

const COLORS = [
  "bg-ui-tag-blue-bg text-ui-tag-blue-text",
  "bg-ui-tag-green-bg text-ui-tag-green-text",
  "bg-ui-tag-orange-bg text-ui-tag-orange-text",
  "bg-ui-tag-purple-bg text-ui-tag-purple-text",
  "bg-ui-tag-red-bg text-ui-tag-red-text",
  "bg-ui-tag-neutral-bg text-ui-tag-neutral-text",
]
function Avatar({ name, email, small, className = "" }: { name: string; email: string; small?: boolean; className?: string }) {
  const key = (email || name).toLowerCase()
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const words = (name && name !== email ? name : email.split("@")[0]).replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/)
  const initials = ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-medium ${small ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-[13px]"} ${COLORS[h % COLORS.length]} ${className}`}
    >
      {initials}
    </span>
  )
}

// An email's own design, shown safely: no scripts, links open in a new tab.
function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(200)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'"><base target="_blank"><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`
  return (
    <iframe
      ref={ref}
      title="Email"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={() => {
        const h = ref.current?.contentDocument?.documentElement?.scrollHeight
        if (h) setHeight(Math.min(h + 16, 4000))
      }}
      style={{ height }}
      className="w-full border-0 bg-white"
    />
  )
}

const download = async (mail: Mail, a: Attachment) => {
  try {
    const res = await fetch(`${BACKEND_URL === "/" ? "" : BACKEND_URL}/admin/mailbox/messages/${mail.id}/attachments/${a.index}`, { credentials: "include" })
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Couldn't download it")
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement("a")
    link.href = url
    link.download = a.filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) {
    toast.error("Couldn't download the attachment", { description: (e as Error).message })
  }
}

type NewFile = { filename: string; content_type: string; data: string; size: number }
const readFiles = (files: FileList | File[]) =>
  Promise.all(
    [...files].map(
      (f) =>
        new Promise<NewFile>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve({ filename: f.name, content_type: f.type || "application/octet-stream", data: String(r.result).split(",")[1] ?? "", size: f.size })
          r.onerror = () => reject(new Error(`Couldn't read ${f.name}`))
          r.readAsDataURL(f)
        })
    )
  )

// ------------------------------------------------------------------ writing an email

const who = (m: Mail) => (m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email || "")
const quoteOf = (m: Mail) => {
  const body = (m.text || "").trim().split("\n").map((l) => `> ${l}`).join("\n")
  return `On ${formatWhen(m.date)}, ${m.folder === "sent" ? `The64Squares <${m.from_email}>` : who(m)} wrote:\n${body}`
}
const forwardOf = (m: Mail) =>
  [
    "---------- Forwarded message ---------",
    `From: ${m.folder === "sent" ? `The64Squares <${m.from_email}>` : who(m)}`,
    `Date: ${formatWhen(m.date)}`,
    `Subject: ${m.subject || "(no subject)"}`,
    `To: ${m.to.map((t) => (t.name ? `${t.name} <${t.address}>` : t.address)).join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map((t) => t.address).join(", ")}`] : []),
    "",
    (m.text || "").trim(),
  ].join("\n")
const withPrefix = (prefix: "Re" | "Fwd", s: string | null) => {
  const subject = s || "(no subject)"
  return new RegExp(`^${prefix === "Re" ? "re" : "(fwd?|fw)"}:`, "i").test(subject) ? subject : `${prefix}: ${subject}`
}
// Who a reply goes to: the person who wrote it, or (replying to our own email) the people
// we wrote to.
const replyTo = (m: Mail) => (m.folder === "inbox" ? [m.reply_to || m.from_email || ""].filter(Boolean) : m.to.map((t) => t.address))
const replyAllCc = (m: Mail, shop: string) => {
  const to = new Set(replyTo(m).map((x) => x.toLowerCase()))
  const all = m.folder === "inbox" ? [...m.to, ...(m.cc ?? [])] : m.cc ?? []
  return [...new Set(all.map((a) => a.address.toLowerCase()))].filter((a) => a && a !== shop.toLowerCase() && !to.has(a))
}
const canReplyAll = (m: Mail, shop: string) => replyAllCc(m, shop).length > 0 || (m.folder === "sent" && m.to.length > 1)

type Draft = { mode: ComposeMode; to: string[]; cc: string[]; subject: string; text: string; files: NewFile[]; carry: number[]; quote: boolean; source?: string }

const draftFor = (mode: ComposeMode, source: Mail | null, shop: string, preset?: { to?: string[]; subject?: string; text?: string }): Draft => {
  if (!source || mode === "new") {
    return { mode: "new", to: preset?.to ?? [], cc: [], subject: preset?.subject ?? "", text: preset?.text ?? "", files: [], carry: [], quote: false }
  }
  if (mode === "forward") {
    return { mode, to: [], cc: [], subject: withPrefix("Fwd", source.subject), text: "", files: [], carry: (source.attachments ?? []).map((a) => a.index), quote: true }
  }
  return {
    mode,
    to: replyTo(source),
    cc: mode === "replyAll" ? replyAllCc(source, shop) : [],
    subject: withPrefix("Re", source.subject),
    text: "",
    files: [],
    carry: [],
    quote: true,
  }
}

// Unsent writing is kept in this browser, so closing the window by mistake loses nothing.
const DRAFTS = "t64-mail-drafts"
const loadDraft = (key: string): Draft | null => {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFTS) || "{}") as Record<string, Draft>
    return all[key] ?? null
  } catch {
    return null
  }
}
const saveDraft = (key: string, d: Draft | null) => {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFTS) || "{}") as Record<string, Draft>
    if (d) all[key] = { ...d, files: [] }
    else delete all[key]
    localStorage.setItem(DRAFTS, JSON.stringify(all))
  } catch {
    // The browser doesn't allow it (private window): just don't keep drafts.
  }
}
export const hasDraft = (key: string) => !!loadDraft(key)
export const copyText = (text: string, what: string) => copy(text, what)

// To / Cc: addresses become chips as you type a comma, a space or press Enter.
function Recipients({ id, value, onChange, suggestions, autoFocus }: { id: string; value: string[]; onChange: (v: string[]) => void; suggestions: Address[]; autoFocus?: boolean }) {
  const [text, setText] = useState("")
  const add = (raw: string) => {
    const found = raw
      .split(/[,;\s]+/)
      .map((x) => x.trim().replace(/^.*<(.+)>$/, "$1").toLowerCase())
      .filter(Boolean)
    if (found.length) onChange([...value, ...found.filter((x) => !value.includes(x))])
    setText("")
  }
  return (
    <div
      className="flex min-h-8 flex-1 flex-wrap items-center gap-1 rounded-md bg-ui-bg-field px-1.5 py-1 shadow-borders-base focus-within:shadow-borders-interactive-with-active"
      onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
    >
      {value.map((a) => (
        <span
          key={a}
          data-chip={a}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 txt-compact-xsmall ${isEmail(a) ? "bg-ui-bg-component shadow-borders-base" : "bg-ui-tag-red-bg text-ui-tag-red-text"}`}
          title={isEmail(a) ? a : "This doesn't look like an email address"}
        >
          {suggestions.find((s) => s.address === a)?.name || a}
          <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(value.filter((x) => x !== a))} className="text-ui-fg-muted hover:text-ui-fg-base">
            <XMarkMini />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={`${id}-list`}
        autoFocus={autoFocus}
        value={text}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value
          if (/[,;\s]$/.test(v)) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Tab") && text.trim()) {
            e.preventDefault()
            add(text)
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
        }}
        onPaste={(e) => {
          const t = e.clipboardData.getData("text")
          if (/[,;\s]/.test(t.trim())) {
            e.preventDefault()
            add(text + t)
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length ? "" : "name@example.com"}
        className="min-w-[140px] flex-1 bg-transparent px-1 txt-compact-small outline-none placeholder:text-ui-fg-muted"
      />
      <datalist id={`${id}-list`}>
        {suggestions.map((s) => (
          <option key={s.address} value={s.address}>
            {s.name}
          </option>
        ))}
      </datalist>
    </div>
  )
}

const MODE_LABEL: Record<ComposeMode, string> = { new: "New email", reply: "Reply", replyAll: "Reply all", forward: "Forward" }
const MODE_ICON: Record<ComposeMode, ReactNode> = { new: <PencilSquare />, reply: <ArrowUturnLeft />, replyAll: <Users />, forward: <ForwardIcon /> }

// Writing an email: a reply, reply all or forward (inside a conversation) or a new one.
export function Composer({
  mode: startMode,
  source,
  draftKey,
  preset,
  suggestions = [],
  onSent,
  onClose,
  onModeChange,
}: {
  mode: ComposeMode
  source?: Mail | null
  draftKey: string
  preset?: { to?: string[]; subject?: string; text?: string }
  suggestions?: Address[]
  onSent: () => void
  onClose: () => void
  onModeChange?: (m: ComposeMode) => void
}) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const menu = useContextMenu()
  const status = useQuery({ queryKey: ["mailbox", "status"], queryFn: () => sdk.client.fetch<Status>("/admin/mailbox") })
  const shop = status.data?.email ?? ""
  // A kept draft comes back when it answers the same email in the same way.
  const fits = (k: Draft | null): k is Draft => !!k && k.mode === startMode && (k.source ?? null) === (source?.id ?? null)
  const [d, setD] = useState<Draft>(() => {
    const kept = loadDraft(draftKey)
    return fits(kept) ? { ...kept, files: [] } : draftFor(startMode, source ?? null, shop, preset)
  })
  const restored = useRef(fits(loadDraft(draftKey)))
  const [showCc, setShowCc] = useState(d.cc.length > 0)
  const [editSubject, setEditSubject] = useState(d.mode === "new" || d.mode === "forward")
  const [showQuote, setShowQuote] = useState(d.mode === "forward")
  const [dragging, setDragging] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLTextAreaElement>(null)

  // Reply all needs the shop's address to leave it out; it arrives a moment later.
  useEffect(() => {
    if (shop && d.mode === "replyAll" && source && !d.cc.length && !restored.current) {
      setD((s) => ({ ...s, cc: replyAllCc(source, shop) }))
      setShowCc(replyAllCc(source, shop).length > 0)
    }
  }, [shop])

  const blank = draftFor(d.mode, source ?? null, shop, preset)
  const dirty = d.text.trim() !== blank.text.trim() || d.files.length > 0 || d.to.join() !== blank.to.join() || d.subject !== blank.subject
  // Kept while writing, and when the writer closes (sent or discarded clears it).
  const latest = useRef<Draft | null>(null)
  const finished = useRef(false)
  latest.current = dirty ? { ...d, source: source?.id } : null
  useEffect(() => {
    const t = setTimeout(() => saveDraft(draftKey, latest.current), 400)
    return () => clearTimeout(t)
  }, [d, dirty, draftKey])
  useEffect(
    () => () => {
      if (!finished.current) saveDraft(draftKey, latest.current)
    },
    [draftKey]
  )

  useEffect(() => {
    if (d.mode !== "forward" && d.mode !== "new") body.current?.focus()
  }, [d.mode])

  const switchTo = (m: ComposeMode) => {
    if (!source || m === d.mode) return
    const next = draftFor(m, source, shop)
    setD({ ...next, text: d.text, files: d.files })
    setShowCc(next.cc.length > 0)
    setEditSubject(m === "forward")
    setShowQuote(m === "forward")
    onModeChange?.(m)
  }

  // Reply / Forward pressed again elsewhere (toolbar, keys) while this is open.
  useEffect(() => {
    if (startMode !== d.mode) switchTo(startMode)
  }, [startMode])

  const extra = source && d.quote ? (d.mode === "forward" ? forwardOf(source) : quoteOf(source)) : ""
  const total = d.files.reduce((n, f) => n + f.size, 0) + (source?.attachments ?? []).filter((a) => d.carry.includes(a.index)).reduce((n, a) => n + a.size, 0)
  const bad = [...d.to, ...d.cc].filter((x) => !isEmail(x))
  const tooBig = total > 20 * 1048576
  const ready = d.to.length > 0 && !bad.length && (!!d.text.trim() || (d.mode === "forward" && !!extra)) && !tooBig

  const send = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ ok: boolean; message: unknown }>("/admin/mailbox/send", {
        method: "POST",
        body: {
          to: d.to,
          cc: d.cc,
          subject: d.subject.trim() || "(no subject)",
          text: [d.text.trimEnd(), extra].filter(Boolean).join("\n\n"),
          reply_to_id: source && (d.mode === "reply" || d.mode === "replyAll") ? source.id : null,
          forward_id: source && d.mode === "forward" ? source.id : null,
          forward_attachments: d.mode === "forward" ? d.carry : [],
          attachments: d.files.map(({ filename, content_type, data }) => ({ filename, content_type, data })),
        },
      }),
    onSuccess: () => {
      finished.current = true
      saveDraft(draftKey, null)
      toast.success("Sent", { description: "It's also in the Sent folder of your webmail." })
      qc.invalidateQueries({ queryKey: ["mailbox"] })
      onSent()
    },
    onError: (e: Error) => toast.error("Couldn't send", { description: e.message }),
  })

  const discard = async () => {
    if (dirty && !(await prompt({ title: "Discard this email?", description: "What you've written will be lost.", confirmText: "Discard", cancelText: "Keep writing" }))) return
    finished.current = true
    saveDraft(draftKey, null)
    onClose()
  }

  const addFiles = async (files: FileList | File[]) => {
    if (!files.length) return
    try {
      const added = await readFiles(files)
      setD((s) => ({ ...s, files: [...s.files, ...added] }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div
      data-composer={d.mode}
      className={`relative flex flex-col gap-y-2 rounded-xl bg-ui-bg-base p-3 shadow-elevation-card-rest ${dragging ? "ring-2 ring-ui-fg-interactive" : ""}`}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready && !send.isPending) {
          e.preventDefault()
          send.mutate()
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      {menu.element}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {source ? (
            <Button
              size="small"
              variant="transparent"
              className="-ml-1"
              aria-haspopup="menu"
              onClick={(e) =>
                menu.openFrom(e.currentTarget, [
                  { label: "Reply", icon: <ArrowUturnLeft />, onSelect: () => switchTo("reply") },
                  { label: "Reply all", icon: <Users />, onSelect: () => switchTo("replyAll"), disabled: !canReplyAll(source, shop) },
                  { label: "Forward", icon: <ForwardIcon />, onSelect: () => switchTo("forward") },
                  "-",
                  { label: editSubject ? "Hide the subject" : "Change the subject", icon: <PencilSquare />, onSelect: () => setEditSubject(!editSubject) },
                ])
              }
            >
              {MODE_ICON[d.mode]}
              {MODE_LABEL[d.mode]}
              <ChevronDown />
            </Button>
          ) : (
            <Text size="small" weight="plus">
              {MODE_LABEL[d.mode]}
            </Text>
          )}
          {restored.current && (
            <Badge size="2xsmall" color="orange">
              Draft
            </Badge>
          )}
        </div>
        <Text size="xsmall" className="text-ui-fg-subtle">
          From The64Squares &lt;{shop || "…"}&gt;
        </Text>
      </div>
      <div className="grid grid-cols-[52px_1fr] items-center gap-x-2 gap-y-2">
        <Label size="small" htmlFor="mail-to" className="text-ui-fg-subtle">
          To
        </Label>
        <div className="flex items-center gap-1">
          <Recipients id="mail-to" value={d.to} onChange={(to) => setD({ ...d, to })} suggestions={suggestions} autoFocus={d.mode === "forward" || (d.mode === "new" && !d.to.length)} />
          {!showCc && (
            <Button size="small" variant="transparent" onClick={() => setShowCc(true)}>
              Cc
            </Button>
          )}
        </div>
        {showCc && (
          <>
            <Label size="small" htmlFor="mail-cc" className="text-ui-fg-subtle">
              Cc
            </Label>
            <Recipients id="mail-cc" value={d.cc} onChange={(cc) => setD({ ...d, cc })} suggestions={suggestions} />
          </>
        )}
        {editSubject && (
          <>
            <Label size="small" htmlFor="mail-subject" className="text-ui-fg-subtle">
              Subject
            </Label>
            <Input id="mail-subject" size="small" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} autoFocus={d.mode === "new" && d.to.length > 0} />
          </>
        )}
      </div>
      <Textarea
        ref={body}
        aria-label="Your message"
        rows={d.mode === "new" ? 12 : 7}
        value={d.text}
        onChange={(e) => setD({ ...d, text: e.target.value })}
        placeholder={d.mode === "forward" ? "Add a note (optional)…" : "Write your message…"}
      />
      {source && d.quote && (
        <div>
          <button
            type="button"
            onClick={() => setShowQuote(!showQuote)}
            className="rounded-md bg-ui-bg-subtle px-2 py-0.5 txt-compact-xsmall text-ui-fg-subtle hover:bg-ui-bg-base-hover"
            aria-expanded={showQuote}
            title={showQuote ? "Hide" : "Show what's included"}
          >
            {d.mode === "forward" ? "Forwarded email included" : "··· earlier email included"}
          </button>
          {d.mode !== "forward" && (
            <button type="button" onClick={() => setD({ ...d, quote: false })} className="ml-2 txt-compact-xsmall text-ui-fg-muted hover:underline">
              Leave it out
            </button>
          )}
          {showQuote && <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-ui-bg-subtle px-3 py-2 font-sans txt-compact-xsmall text-ui-fg-subtle">{extra}</pre>}
        </div>
      )}
      {(d.files.length > 0 || (d.mode === "forward" && !!source?.attachments?.length)) && (
        <div className="flex flex-wrap gap-2">
          {d.mode === "forward" &&
            source?.attachments?.map((a) => {
              const on = d.carry.includes(a.index)
              return (
                <label key={`f${a.index}`} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 txt-compact-xsmall shadow-borders-base ${on ? "bg-ui-bg-component" : "bg-ui-bg-subtle text-ui-fg-muted line-through"}`}>
                  <input type="checkbox" checked={on} onChange={() => setD({ ...d, carry: on ? d.carry.filter((x) => x !== a.index) : [...d.carry, a.index] })} />
                  <PaperClip />
                  {a.filename} ({size(a.size)})
                </label>
              )
            })}
          {d.files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-md bg-ui-bg-component px-2 py-1 txt-compact-xsmall shadow-borders-base">
              <PaperClip />
              {f.filename} ({size(f.size)})
              <button type="button" aria-label={`Remove ${f.filename}`} onClick={() => setD({ ...d, files: d.files.filter((_, j) => j !== i) })}>
                <XMarkMini />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <Button size="small" isLoading={send.isPending} disabled={!ready} onClick={() => send.mutate()} title="Send (Ctrl + Enter)">
            <PaperPlane />
            Send
          </Button>
          <input
            ref={file}
            type="file"
            multiple
            className="hidden"
            aria-label="Attach files"
            onChange={async (e) => {
              if (e.target.files?.length) await addFiles([...e.target.files])
              e.target.value = ""
            }}
          />
          <IconButton size="small" variant="transparent" aria-label="Attach files" title="Attach files (or drop them here)" onClick={() => file.current?.click()}>
            <PaperClip />
          </IconButton>
          <Text size="xsmall" className="hidden text-ui-fg-muted sm:block">
            Ctrl + Enter to send
          </Text>
        </div>
        <IconButton size="small" variant="transparent" aria-label="Discard" title="Discard" onClick={discard}>
          <Trash />
        </IconButton>
      </div>
      {(bad.length > 0 || tooBig) && (
        <Text size="xsmall" className="text-ui-fg-error">
          {bad.length ? `Check ${bad.length === 1 ? "this address" : "these addresses"}: ${bad.join(", ")}` : "Attachments can be up to 20 MB in total."}
        </Text>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-ui-bg-base opacity-95 txt-compact-small-plus">Drop files to attach them</div>
      )}
    </div>
  )
}

// A new email in its own panel (also used to answer Contact page messages).
export function ComposeDrawer({
  preset,
  draftKey = "new",
  onClose,
  onSent,
  suggestions,
}: {
  preset?: { to?: string[]; subject?: string; text?: string }
  draftKey?: string
  onClose: () => void
  onSent?: () => void
  suggestions?: Address[]
}) {
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[760px]">
        <Drawer.Header>
          <Drawer.Title>New email</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto bg-ui-bg-subtle">
          <Composer mode="new" draftKey={draftKey} preset={preset} suggestions={suggestions} onSent={() => (onSent?.(), onClose())} onClose={onClose} />
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

// ------------------------------------------------------------------ actions with Undo

const DONE_TEXT: Partial<Record<Action, (n: number) => string>> = {
  done: (n) => (n === 1 ? "Marked as answered" : `${n} conversations marked as answered`),
  inbox: (n) => (n === 1 ? "Moved to the inbox" : `${n} conversations moved to the inbox`),
  unread: (n) => (n === 1 ? "Marked as unread" : `${n} conversations marked as unread`),
  read: (n) => `${n} conversations marked as read`,
  star: (n) => `${n} conversations starred`,
  unstar: (n) => `Star removed from ${n} conversations`,
}
const UNDO: Partial<Record<Action, Action>> = { done: "inbox", inbox: "done", read: "unread", unread: "read", star: "unstar", unstar: "star" }

const patch = (t: Thread, a: Action): Thread => {
  switch (a) {
    case "read":
      return { ...t, unread: 0, state: t.state === "new" ? "open" : t.state }
    case "unread":
      return { ...t, unread: Math.max(1, t.unread), state: t.state === "sent" ? t.state : "new" }
    case "done":
      return { ...t, unread: 0, state: t.state === "sent" ? t.state : "done" }
    case "inbox":
      return { ...t, state: t.state === "done" ? "open" : t.state }
    case "star":
      return { ...t, starred: true }
    case "unstar":
      return { ...t, starred: false }
    default:
      return t
  }
}
// Leaves the folder you're looking at straight away (the rest tidy up on the next refresh).
const leaves = (f: Folder, a: Action) => (f === "inbox" && a === "done") || (f === "done" && a === "inbox") || (f === "starred" && a === "unstar")

function useMailActions(folder: Folder, listKey: unknown[]) {
  const qc = useQueryClient()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const pending = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null)

  const call = (ids: string[], action: Action) => sdk.client.fetch<{ ok: boolean }>("/admin/mailbox/actions", { method: "POST", body: { ids, action } })
  const unhide = (ids: string[]) => setHidden((h) => new Set([...h].filter((x) => !ids.includes(x))))

  const commitDelete = useCallback(
    (p: { ids: string[] }) =>
      call(p.ids, "delete")
        .then(() => qc.invalidateQueries({ queryKey: ["mailbox"] }))
        .then(() => unhide(p.ids))
        .catch((e: Error) => {
          unhide(p.ids)
          toast.error("Couldn't delete", { description: e.message })
        }),
    [qc]
  )
  const flush = useCallback(() => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    commitDelete(p)
  }, [commitDelete])
  // Leaving the page finishes a delete that was still waiting for Undo.
  useEffect(() => flush, [flush])

  const act = (ids: string[], action: Action, quiet = false) => {
    if (!ids.length) return
    if (action === "delete") {
      flush()
      setHidden((h) => new Set([...h, ...ids]))
      const p = { ids, timer: setTimeout(() => (pending.current = null, commitDelete(p)), 6000) }
      pending.current = p
      toast.success(ids.length === 1 ? "Moved to Trash" : `${ids.length} conversations moved to Trash`, {
        description: "It goes to the Trash of your webmail too.",
        duration: 6000,
        action: {
          label: "Undo",
          altText: "Undo delete",
          onClick: () => {
            clearTimeout(p.timer)
            if (pending.current === p) pending.current = null
            unhide(ids)
          },
        },
      })
      return
    }
    qc.setQueryData<ThreadList>(listKey, (old) =>
      old
        ? {
            ...old,
            threads: old.threads.filter((t) => !(ids.includes(t.id) && leaves(folder, action))).map((t) => (ids.includes(t.id) ? patch(t, action) : t)),
          }
        : old
    )
    call(ids, action)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["mailbox"] })
        const text = DONE_TEXT[action]
        const undo = UNDO[action]
        const worth = action === "done" || action === "inbox" || action === "unread" || ids.length > 1
        if (!quiet && text && worth) {
          toast.success(text(ids.length), undo ? { action: { label: "Undo", altText: "Undo", onClick: () => act(ids, undo, true) } } : undefined)
        }
      })
      .catch((e: Error) => {
        qc.invalidateQueries({ queryKey: ["mailbox"] })
        toast.error("Couldn't do that", { description: e.message })
      })
  }
  return { act, hidden }
}

// ------------------------------------------------------------------ one conversation

function ThreadView({
  id,
  ids,
  start,
  act,
  onNavigate,
  onClose,
  onFind,
  suggestions,
}: {
  id: string
  ids: string[]
  start: ComposeMode | null
  act: (ids: string[], a: Action) => void
  onNavigate: (id: string) => void
  onClose: () => void
  onFind: (q: string) => void
  suggestions: Address[]
}) {
  const qc = useQueryClient()
  const menu = useContextMenu()
  const status = useQuery({ queryKey: ["mailbox", "status"], queryFn: () => sdk.client.fetch<Status>("/admin/mailbox") })
  const shop = status.data?.email ?? ""
  const { data, isLoading } = useQuery({
    queryKey: ["mailbox", "thread", id],
    queryFn: () => sdk.client.fetch<{ messages: Mail[]; customer: Customer | null }>(`/admin/mailbox/threads/${encodeURIComponent(id)}`),
  })
  const messages = useMemo(() => data?.messages ?? [], [data])
  const draftKey = `thread:${id}`
  const [compose, setCompose] = useState<{ mode: ComposeMode; source: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [note, setNote] = useState("")
  const [noteOpen, setNoteOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const saveNote = useMutation({
    mutationFn: (value: string | null) => sdk.client.fetch(`/admin/mailbox/threads/${encodeURIComponent(id)}`, { method: "POST", body: { note: value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mailbox", "thread", id] })
      toast.success("Note saved")
    },
  })
  const markRead = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/mailbox/threads/${encodeURIComponent(id)}`, { method: "POST", body: { status: "read" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mailbox", "threads"] }),
  })

  const last = messages[messages.length - 1]
  const subject = messages[0]?.subject || "(no subject)"
  const inbox = messages.filter((m) => m.folder === "inbox")
  // Reply, Reply all and Forward from the toolbar answer the customer's newest email (not,
  // say, our own forward to the courier). Each email's own menu answers that email.
  const target = inbox[inbox.length - 1] ?? last
  const answered = inbox.length > 0 && inbox.every((m) => m.status === "done")
  const starred = messages.some((m) => m.starred)

  // Moving to another conversation: nothing half-open from the last one.
  useEffect(() => setCompose(null), [id])
  // A new email in the conversation (e.g. the reply just sent) shows opened.
  useEffect(() => {
    if (last) setExpanded((s) => (s.has(last.id) ? s : new Set([...s, last.id])))
  }, [messages.length])

  // New conversation shown: open the newest and any unread emails, mark it read, and pick
  // up a reply left half-written (or the one asked for from the list).
  useEffect(() => {
    if (!data) return
    setExpanded(new Set(messages.filter((m, i) => i === messages.length - 1 || m.status === "new" || messages.length <= 2).map((m) => m.id)))
    setShowAll(false)
    setNote(last?.note ?? "")
    setNoteOpen(!!last?.note)
    const kept = loadDraft(draftKey)
    const mode = start ?? kept?.mode ?? null
    const aim = [...messages].reverse().find((m) => m.folder === "inbox") ?? last
    setCompose(mode && aim && mode !== "new" ? { mode, source: kept?.source && messages.some((m) => m.id === kept.source) ? kept.source : aim.id } : null)
    if (messages.some((m) => m.folder === "inbox" && m.status === "new")) markRead.mutate()
  }, [data?.messages[0]?.id, id])

  useEffect(() => {
    if (compose) setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50)
  }, [compose?.mode, compose?.source])

  const at = ids.indexOf(id)
  const newer = at > 0 ? ids[at - 1] : null
  const older = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null
  const reply = (mode: ComposeMode, m: Mail | undefined = target) => m && setCompose({ mode, source: m.id })
  const doAndClose = (a: Action) => {
    act([id], a)
    onClose()
  }

  const messageMenu = (m: Mail): MenuItem[] => {
    const address = m.folder === "inbox" ? m.reply_to || m.from_email || "" : m.to[0]?.address || ""
    return [
      { label: "Reply", icon: <ArrowUturnLeft />, shortcut: "R", onSelect: () => reply("reply", m) },
      { label: "Reply all", icon: <Users />, shortcut: "A", onSelect: () => reply("replyAll", m), disabled: !canReplyAll(m, shop) },
      { label: "Forward", icon: <ForwardIcon />, shortcut: "F", onSelect: () => reply("forward", m) },
      "-",
      { label: `Copy ${address || "email address"}`, icon: <SquareTwoStack />, onSelect: () => copy(address, "Email address"), disabled: !address },
      { label: "Copy the text of this email", icon: <SquareTwoStack />, onSelect: () => copy(m.text || "", "Text"), disabled: !m.text },
      { label: "Find emails with this person", icon: <MagnifyingGlass />, onSelect: () => (onClose(), onFind(address)), disabled: !address },
      ...(m.attachments?.length
        ? (["-", { label: `Download ${plural(m.attachments.length, "attachment")}`, icon: <ArrowDownTray />, onSelect: () => m.attachments!.forEach((a) => download(m, a)) }] as MenuItem[])
        : []),
    ]
  }

  const toolbarMenu = (): MenuItem[] => [
    { label: "Reply", icon: <ArrowUturnLeft />, shortcut: "R", onSelect: () => reply("reply") },
    { label: "Reply all", icon: <Users />, shortcut: "A", onSelect: () => reply("replyAll"), disabled: !target || !canReplyAll(target, shop) },
    { label: "Forward", icon: <ForwardIcon />, shortcut: "F", onSelect: () => reply("forward") },
    "-",
    answered
      ? { label: "Move back to the inbox", icon: <InboxSolid />, shortcut: "E", onSelect: () => doAndClose("inbox") }
      : { label: "Mark as answered", icon: <CheckCircle />, shortcut: "E", onSelect: () => doAndClose("done"), disabled: !inbox.length },
    { label: "Mark as unread", icon: <EnvelopeSolid />, shortcut: "U", onSelect: () => doAndClose("unread"), disabled: !inbox.length },
    { label: starred ? "Remove star" : "Add star", icon: starred ? <StarSolid /> : <Star />, shortcut: "S", onSelect: () => act([id], starred ? "unstar" : "star") },
    "-",
    { label: "Expand all", icon: <ChevronDown />, onSelect: () => (setShowAll(true), setExpanded(new Set(messages.map((m) => m.id)))) },
    { label: "Write a team note", icon: <PencilSquare />, onSelect: () => setNoteOpen(true) },
    "-",
    { label: "Delete", icon: <Trash />, shortcut: "#", danger: true, onSelect: () => doAndClose("delete") },
  ]

  // Keys inside a conversation, as in Gmail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || menu.isOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === "r") reply("reply")
      else if (k === "a" && target && canReplyAll(target, shop)) reply("replyAll")
      else if (k === "f") reply("forward")
      else if (k === "e" && inbox.length) doAndClose(answered ? "inbox" : "done")
      else if (k === "u" && inbox.length) doAndClose("unread")
      else if (k === "s") act([id], starred ? "unstar" : "star")
      else if (k === "#" || k === "Delete") doAndClose("delete")
      else if ((k === "j" || k === "ArrowRight") && older) onNavigate(older)
      else if ((k === "k" || k === "ArrowLeft") && newer) onNavigate(newer)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const collapsed = (m: Mail) => !expanded.has(m.id)
  const middle = messages.slice(1, -1)
  const fold = !showAll && middle.length >= 3 && middle.every(collapsed)
  const shown = fold ? [messages[0], null, last] : messages
  const sourceMail = compose ? messages.find((m) => m.id === compose.source) ?? target : null

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[980px]" onEscapeKeyDown={(e) => menu.isOpen && e.preventDefault()}>
        {menu.element}
        <Drawer.Header>
          <Drawer.Title className="line-clamp-1">{subject}</Drawer.Title>
        </Drawer.Header>
        <div className="flex flex-wrap items-center gap-1 border-b border-ui-border-base px-4 py-2" role="toolbar" aria-label="Conversation">
          <Button size="small" variant="transparent" onClick={onClose} title="Back to the list (Esc)">
            <ChevronLeft />
            Back
          </Button>
          <span className="mx-1 h-5 w-px bg-ui-border-base" />
          {answered ? (
            <Button size="small" variant="secondary" onClick={() => doAndClose("inbox")} title="Move back to the inbox (E)">
              <InboxSolid />
              <span className="hidden sm:inline">Move to inbox</span>
            </Button>
          ) : (
            <Button size="small" variant="secondary" disabled={!inbox.length} onClick={() => doAndClose("done")} title="Mark as answered (E)">
              <CheckCircle />
              <span className="hidden sm:inline">Answered</span>
            </Button>
          )}
          <Button size="small" variant="secondary" disabled={!inbox.length} onClick={() => doAndClose("unread")} title="Mark as unread (U)">
            <EnvelopeSolid />
            <span className="hidden sm:inline">Unread</span>
          </Button>
          <Button size="small" variant="secondary" onClick={() => act([id], starred ? "unstar" : "star")} title={starred ? "Remove star (S)" : "Star (S)"} data-star-thread={starred ? "on" : "off"}>
            {starred ? <StarSolid className="text-ui-tag-orange-icon" /> : <Star />}
            <span className="hidden sm:inline">{starred ? "Starred" : "Star"}</span>
          </Button>
          <Button size="small" variant="secondary" onClick={() => doAndClose("delete")} title="Delete (#)">
            <Trash />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          <IconButton size="small" variant="transparent" aria-label="More" aria-haspopup="menu" onClick={(e) => menu.openFrom(e.currentTarget, toolbarMenu())}>
            <EllipsisHorizontal />
          </IconButton>
          <div className="ml-auto flex items-center gap-1">
            {at >= 0 && (
              <Text size="xsmall" className="mr-1 text-ui-fg-subtle">
                {at + 1} of {ids.length}
              </Text>
            )}
            <IconButton size="small" variant="transparent" aria-label="Newer conversation" title="Newer (K)" disabled={!newer} onClick={() => newer && onNavigate(newer)}>
              <ChevronLeft />
            </IconButton>
            <IconButton size="small" variant="transparent" aria-label="Older conversation" title="Older (J)" disabled={!older} onClick={() => older && onNavigate(older)}>
              <ChevronRight />
            </IconButton>
          </div>
        </div>
        <Drawer.Body className="flex flex-col gap-y-3 overflow-y-auto bg-ui-bg-subtle">
          {isLoading && <Text size="small">Loading…</Text>}
          {data?.customer && (
            <Container className="flex flex-col gap-2 px-4 py-3" data-customer>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="small" weight="plus">
                  {data.customer.name || data.customer.email}
                  {data.customer.phone ? ` · ${data.customer.phone}` : ""}
                </Text>
                {data.customer.id && (
                  <Link to={`/customers/${data.customer.id}`} className="txt-compact-small text-ui-fg-interactive hover:underline">
                    Open customer
                  </Link>
                )}
              </div>
              {data.customer.orders.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.customer.orders.map((o) => (
                    <Link key={o.id} to={`/orders/${o.id}`} className="rounded-md bg-ui-bg-subtle px-2 py-1 txt-compact-xsmall shadow-borders-base hover:bg-ui-bg-base-hover">
                      Order #{o.display_id} · {money(o.total, o.currency_code)} · {formatWhen(o.created_at).split(",")[0]}
                    </Link>
                  ))}
                </div>
              ) : (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  No orders yet.
                </Text>
              )}
            </Container>
          )}
          <div className="flex flex-col overflow-hidden rounded-xl bg-ui-bg-base shadow-elevation-card-rest">
            {shown.map((m, i) =>
              m === null ? (
                <button
                  key="more"
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex items-center gap-3 border-t border-ui-border-base px-4 py-2 txt-compact-small text-ui-fg-interactive hover:bg-ui-bg-base-hover"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ui-bg-component shadow-borders-base txt-compact-xsmall-plus">{middle.length}</span>
                  Show {middle.length} older emails
                </button>
              ) : (
                <MessageCard
                  key={m.id}
                  m={m}
                  first={i === 0}
                  open={!collapsed(m)}
                  shop={shop}
                  onToggle={() => setExpanded((s) => (s.has(m.id) ? new Set([...s].filter((x) => x !== m.id)) : new Set([...s, m.id])))}
                  onReply={() => reply("reply", m)}
                  onMenu={(e) => menu.open(e, messageMenu(m))}
                  onMore={(el) => menu.openFrom(el, messageMenu(m))}
                />
              )
            )}
          </div>
          <div ref={bottom}>
            {compose && sourceMail ? (
              <Composer
                key={compose.source}
                mode={compose.mode}
                source={sourceMail}
                draftKey={draftKey}
                suggestions={suggestions}
                onSent={() => setCompose(null)}
                onClose={() => setCompose(null)}
                onModeChange={(mode) => setCompose({ mode, source: compose.source })}
              />
            ) : (
              target && (
                <div className="flex flex-wrap gap-2">
                  <Button size="small" variant="secondary" onClick={() => reply("reply")} title="Reply (R)">
                    <ArrowUturnLeft />
                    Reply
                  </Button>
                  {canReplyAll(target, shop) && (
                    <Button size="small" variant="secondary" onClick={() => reply("replyAll")} title="Reply all (A)">
                      <Users />
                      Reply all
                    </Button>
                  )}
                  <Button size="small" variant="secondary" onClick={() => reply("forward")} title="Forward (F)">
                    <ForwardIcon />
                    Forward
                  </Button>
                </div>
              )
            )}
          </div>
          {noteOpen ? (
            <Container className="flex flex-col gap-y-2 px-4 py-3">
              <Label htmlFor="mail-note" size="small">
                Note for the team (only seen here)
              </Label>
              <Textarea id="mail-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sent a replacement part on Monday" />
              <div className="flex justify-end gap-2">
                <Button size="small" variant="secondary" onClick={() => (setNote(last?.note ?? ""), setNoteOpen(!!last?.note))}>
                  Cancel
                </Button>
                <Button size="small" isLoading={saveNote.isPending} onClick={() => saveNote.mutate(note.trim() || null)}>
                  Save note
                </Button>
              </div>
            </Container>
          ) : (
            <div>
              <Button size="small" variant="transparent" onClick={() => setNoteOpen(true)}>
                <PencilSquare />
                Add a team note
              </Button>
            </div>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

function MessageCard({
  m,
  first,
  open,
  shop,
  onToggle,
  onReply,
  onMenu,
  onMore,
}: {
  m: Mail
  first: boolean
  open: boolean
  shop: string
  onToggle: () => void
  onReply: () => void
  onMenu: (e: React.MouseEvent) => void
  onMore: (el: HTMLElement) => void
}) {
  const ours = m.folder === "sent"
  const name = ours ? `The64Squares${m.sent_by ? ` (${m.sent_by})` : ""}` : m.from_name || m.from_email || ""
  const toLine = m.to.map((t) => (t.address === shop.toLowerCase() ? "me" : t.name || t.address)).join(", ")
  return (
    <div data-mail={m.id} data-open={open ? "yes" : "no"} className={`${first ? "" : "border-t border-ui-border-base"} ${m.status === "new" ? "bg-ui-bg-base" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggle()
          }
        }}
        onContextMenu={onMenu}
        className="flex cursor-pointer items-start gap-3 px-4 py-3 outline-none hover:bg-ui-bg-base-hover focus-visible:bg-ui-bg-base-hover"
      >
        <Avatar name={ours ? "The64Squares" : name} email={ours ? shop : m.from_email || ""} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Text size="small" weight="plus" className="truncate">
              {name}
            </Text>
            {open && !ours && m.from_name && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                &lt;{m.from_email}&gt;
              </Text>
            )}
            {m.reply_to && m.reply_to !== m.from_email && open && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                replies go to {m.reply_to}
              </Text>
            )}
          </div>
          {open ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              to {toLine}
              {m.cc?.length ? `, cc ${m.cc.map((t) => t.name || t.address).join(", ")}` : ""}
            </Text>
          ) : (
            <Text size="xsmall" className="line-clamp-1 text-ui-fg-subtle">
              {m.snippet || (m.text || "").slice(0, 160)}
            </Text>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!!m.attachments?.length && !open && <PaperClip className="text-ui-fg-muted" />}
          {m.starred && <StarSolid className="text-ui-tag-orange-icon" />}
          <Text size="xsmall" className="text-ui-fg-subtle" title={formatWhen(m.date)}>
            {open ? formatWhen(m.date) : shortDate(m.date)}
          </Text>
          {open && (
            <>
              <IconButton
                size="small"
                variant="transparent"
                aria-label="Reply"
                title="Reply"
                onClick={(e) => {
                  e.stopPropagation()
                  onReply()
                }}
              >
                <ArrowUturnLeft />
              </IconButton>
              <IconButton
                size="small"
                variant="transparent"
                aria-label="More for this email"
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation()
                  onMore(e.currentTarget)
                }}
              >
                <EllipsisHorizontal />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {open && (
        <>
          <div className="px-4 pb-3 pl-16">
            {m.html ? <HtmlBody html={m.html} /> : <pre className="whitespace-pre-wrap break-words font-sans txt-small">{m.text || "(empty)"}</pre>}
          </div>
          {!!m.attachments?.length && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 pl-16">
              {m.attachments.map((a) => (
                <button
                  key={a.index}
                  type="button"
                  onClick={() => download(m, a)}
                  title="Download"
                  className="flex items-center gap-2 rounded-lg bg-ui-bg-component px-3 py-2 text-left shadow-borders-base hover:bg-ui-bg-component-hover"
                >
                  <PaperClip className="text-ui-fg-muted" />
                  <span className="flex flex-col">
                    <span className="max-w-[220px] truncate txt-compact-xsmall-plus">{a.filename}</span>
                    <span className="txt-compact-xsmall text-ui-fg-subtle">{size(a.size)}</span>
                  </span>
                  <ArrowDownTray className="text-ui-fg-muted" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ the list

const SHORTCUTS: [string, string][] = [
  ["J / ↓", "Next conversation"],
  ["K / ↑", "Previous conversation"],
  ["Enter or O", "Open"],
  ["X", "Tick / untick"],
  ["R", "Reply"],
  ["A", "Reply all"],
  ["F", "Forward"],
  ["E", "Answered (or back to the inbox)"],
  ["U", "Read / unread"],
  ["S", "Star"],
  ["# or Delete", "Delete"],
  ["C", "New email"],
  ["/", "Search"],
  ["Esc", "Close, or untick everything"],
  ["Ctrl + Enter", "Send (while writing)"],
  ["Right-click", "All the actions for an email"],
]

export function MailInbox() {
  const [params, setParams] = useSearchParams()
  const folder = (FOLDERS.some((f) => f.value === params.get("box")) ? params.get("box") : "inbox") as Folder
  const [qInput, setQInput] = useState("")
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [start, setStart] = useState<ComposeMode | null>(null)
  const [help, setHelp] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const menu = useContextMenu()
  const qc = useQueryClient()
  const open = params.get("thread")

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim())
      setOffset(0)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  const status = useQuery({ queryKey: ["mailbox", "status"], queryFn: () => sdk.client.fetch<Status>("/admin/mailbox"), refetchInterval: 60_000 })
  const listKey = ["mailbox", "threads", folder, q, offset]
  const { data, isLoading, isFetching } = useQuery({
    queryKey: listKey,
    queryFn: () => sdk.client.fetch<ThreadList>("/admin/mailbox/threads", { query: { filter: folder, q: q || undefined, offset } }),
    refetchInterval: 60_000,
    enabled: !!status.data?.connected,
    placeholderData: (prev) => prev,
  })
  const { act, hidden } = useMailActions(folder, listKey)
  const threads = useMemo(() => (data?.threads ?? []).filter((t) => !hidden.has(t.id)), [data, hidden])
  const ids = threads.map((t) => t.id)
  const suggestions = useMemo(() => {
    const seen = new Map<string, Address>()
    for (const t of data?.threads ?? []) if (t.email && !seen.has(t.email)) seen.set(t.email, { name: t.name !== t.email ? t.name : "", address: t.email })
    return [...seen.values()]
  }, [data])

  // A different folder, search or page starts with nothing ticked.
  useEffect(() => {
    setSelected(new Set())
    setCursor(0)
    setAnchor(null)
  }, [folder, q, offset])
  useEffect(() => {
    if (cursor >= threads.length && threads.length) setCursor(threads.length - 1)
  }, [threads.length])

  const sync = useMutation({
    mutationFn: () => sdk.client.fetch<{ ok: boolean; added: number; message?: string }>("/admin/mailbox/sync", { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["mailbox"] })
      if (r.ok) toast.success(r.added ? `${plural(r.added, "new email")}` : "No new emails")
      else toast.error("Couldn't check the mailbox", { description: r.message })
    },
  })

  const setOpen = (id: string | null, mode: ComposeMode | null = null) => {
    setStart(mode)
    const next = new URLSearchParams(params)
    if (id) next.set("thread", id)
    else next.delete("thread")
    setParams(next, { replace: true })
    if (id) {
      const i = ids.indexOf(id)
      if (i >= 0) setCursor(i)
    } else setTimeout(() => rowRefs.current[cursor]?.focus({ preventScroll: true }), 0)
  }
  const go = (f: Folder) => {
    const next = new URLSearchParams(params)
    if (f === "inbox") next.delete("box")
    else next.set("box", f)
    next.delete("thread")
    setParams(next, { replace: true })
    setOffset(0)
  }
  const find = (text: string) => {
    setQInput(text)
    go("all")
  }

  // What an action applies to: the ticked conversations, else the one under the cursor.
  const targets = (t?: Thread) => (t && !selected.has(t.id) ? [t] : selected.size ? threads.filter((x) => selected.has(x.id)) : threads[cursor] ? [threads[cursor]] : [])
  const run = (list: Thread[], a: Action) => {
    act(
      list.map((t) => t.id),
      a
    )
    if (a === "delete" || leaves(folder, a)) setSelected(new Set())
  }
  const toggle = (i: number, shift: boolean) => {
    const t = threads[i]
    if (!t) return
    const next = new Set(selected)
    if (shift && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]
      const on = !selected.has(t.id)
      for (let k = a; k <= b; k++) {
        if (on) next.add(threads[k].id)
        else next.delete(threads[k].id)
      }
    } else if (next.has(t.id)) next.delete(t.id)
    else next.add(t.id)
    setSelected(next)
    setAnchor(i)
  }

  const rowMenu = (t: Thread): MenuItem[] => {
    const list = targets(t)
    if (list.length > 1) {
      const anyUnread = list.some((x) => x.unread > 0)
      const anyStar = list.some((x) => x.starred)
      const allDone = list.every((x) => x.state === "done")
      return [
        { heading: `${list.length} conversations ticked` },
        allDone
          ? { label: "Move back to the inbox", icon: <InboxSolid />, shortcut: "E", onSelect: () => run(list, "inbox") }
          : { label: "Mark as answered", icon: <CheckCircle />, shortcut: "E", onSelect: () => run(list, "done") },
        anyUnread
          ? { label: "Mark as read", icon: <Envelope />, shortcut: "U", onSelect: () => run(list, "read") }
          : { label: "Mark as unread", icon: <EnvelopeSolid />, shortcut: "U", onSelect: () => run(list, "unread") },
        anyStar
          ? { label: "Remove stars", icon: <StarSolid />, shortcut: "S", onSelect: () => run(list, "unstar") }
          : { label: "Add stars", icon: <Star />, shortcut: "S", onSelect: () => run(list, "star") },
        "-",
        { label: "Untick all", icon: <XMarkMini />, onSelect: () => setSelected(new Set()) },
        "-",
        { label: `Delete ${list.length} conversations`, icon: <Trash />, shortcut: "#", danger: true, onSelect: () => run(list, "delete") },
      ]
    }
    const one = [t]
    const waiting = t.state === "new" || t.state === "open"
    return [
      { label: "Open", icon: <Envelope />, shortcut: "O", onSelect: () => setOpen(t.id) },
      { label: "Reply", icon: <ArrowUturnLeft />, shortcut: "R", onSelect: () => setOpen(t.id, "reply") },
      { label: "Reply all", icon: <Users />, shortcut: "A", onSelect: () => setOpen(t.id, "replyAll") },
      { label: "Forward", icon: <ForwardIcon />, shortcut: "F", onSelect: () => setOpen(t.id, "forward") },
      "-",
      t.unread > 0
        ? { label: "Mark as read", icon: <Envelope />, shortcut: "U", onSelect: () => run(one, "read") }
        : { label: "Mark as unread", icon: <EnvelopeSolid />, shortcut: "U", onSelect: () => run(one, "unread"), disabled: t.state === "sent" },
      t.state === "done"
        ? { label: "Move back to the inbox", icon: <InboxSolid />, shortcut: "E", onSelect: () => run(one, "inbox") }
        : { label: "Mark as answered", icon: <CheckCircle />, shortcut: "E", onSelect: () => run(one, "done"), disabled: !waiting },
      t.starred
        ? { label: "Remove star", icon: <StarSolid />, shortcut: "S", onSelect: () => run(one, "unstar") }
        : { label: "Add star", icon: <Star />, shortcut: "S", onSelect: () => run(one, "star") },
      { label: selected.has(t.id) ? "Untick" : "Tick", icon: <CheckCircle />, shortcut: "X", onSelect: () => toggle(threads.indexOf(t), false) },
      "-",
      { label: `Copy ${t.email || "email address"}`, icon: <SquareTwoStack />, onSelect: () => copy(t.email, "Email address"), disabled: !t.email },
      { label: `Find emails with ${t.name && t.name !== t.email ? t.name.split(" ")[0] : "this person"}`, icon: <MagnifyingGlass />, onSelect: () => find(t.email), disabled: !t.email },
      "-",
      { label: "Delete", icon: <Trash />, shortcut: "#", danger: true, onSelect: () => run(one, "delete") },
    ]
  }

  const selectMenu = (): MenuItem[] => [
    { label: "All", onSelect: () => setSelected(new Set(ids)) },
    { label: "None", onSelect: () => setSelected(new Set()) },
    { label: "Unread", onSelect: () => setSelected(new Set(threads.filter((t) => t.unread > 0).map((t) => t.id))) },
    { label: "Read", onSelect: () => setSelected(new Set(threads.filter((t) => !t.unread).map((t) => t.id))) },
    { label: "Starred", onSelect: () => setSelected(new Set(threads.filter((t) => t.starred).map((t) => t.id))) },
    { label: "Not starred", onSelect: () => setSelected(new Set(threads.filter((t) => !t.starred).map((t) => t.id))) },
  ]

  // Keys on the list, as in Gmail. Off while a conversation or new email is open.
  useEffect(() => {
    if (open || composing || help) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || menu.isOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      const t = threads[cursor]
      const list = targets()
      const focus = (i: number) => {
        setCursor(i)
        rowRefs.current[i]?.focus({ preventScroll: false })
      }
      if ((k === "j" || k === "ArrowDown") && threads.length) focus(Math.min(cursor + 1, threads.length - 1))
      else if ((k === "k" || k === "ArrowUp") && threads.length) focus(Math.max(cursor - 1, 0))
      else if ((k === "o" || k === "Enter") && t) setOpen(t.id)
      else if (k === "x" && t) toggle(cursor, e.shiftKey)
      else if (k === "r" && t) setOpen(t.id, "reply")
      else if (k === "a" && t) setOpen(t.id, "replyAll")
      else if (k === "f" && t) setOpen(t.id, "forward")
      else if (k === "e" && list.length) run(list, list.every((x) => x.state === "done") ? "inbox" : "done")
      else if (k === "u" && list.length) run(list, list.some((x) => x.unread > 0) ? "read" : "unread")
      else if (k === "s" && list.length) run(list, list.some((x) => x.starred) ? "unstar" : "star")
      else if ((k === "#" || k === "Delete") && list.length) run(list, "delete")
      else if (k === "c") setComposing(true)
      else if (k === "/") search.current?.focus()
      else if (k === "?") setHelp(true)
      else if (k === "Escape" && selected.size) setSelected(new Set())
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const s = status.data
  if (status.isLoading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  if (!s?.connected) {
    return (
      <Container className="flex flex-col gap-3 px-6 py-6">
        <Heading level="h2">Connect your shop inbox</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          See every email sent to your shop address (like hello@the64squares.in) right here, and reply from the admin. The main admin adds the
          inbox's email and password once, in Settings → Payments &amp; delivery → Keys → Shop inbox. Your webmail and phone app keep working
          as before.
        </Text>
        <div>
          <Button size="small" asChild>
            <Link to="/settings/payments">Open Keys</Link>
          </Button>
        </div>
      </Container>
    )
  }

  const counts = data?.counts
  const countFor = (f: Folder) => (f === "inbox" ? counts?.inbox : f === "unread" ? counts?.new : f === "starred" ? counts?.starred : undefined)
  const all = threads.length > 0 && threads.every((t) => selected.has(t.id))
  const some = selected.size > 0 && !all
  const ticked = threads.filter((t) => selected.has(t.id))
  const info = FOLDERS.find((f) => f.value === folder)!

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
      {menu.element}
      {/* Folders */}
      <div className="flex flex-col gap-3">
        <Button onClick={() => setComposing(true)} className="justify-start md:h-11" title="New email (C)">
          <PencilSquare />
          New email
        </Button>
        <nav aria-label="Folders" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
          {FOLDERS.map((f) => {
            const n = countFor(f.value)
            const on = folder === f.value
            return (
              <button
                key={f.value}
                type="button"
                data-folder={f.value}
                aria-current={on ? "page" : undefined}
                onClick={() => go(f.value)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-left txt-compact-small md:rounded-r-full md:rounded-l-md ${
                  on ? "bg-ui-bg-highlight txt-compact-small-plus text-ui-fg-interactive" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover"
                }`}
              >
                <span className={on ? "" : "text-ui-fg-muted"}>{f.icon}</span>
                <span className="flex-1">{f.label}</span>
                {!!n && <span className={f.value === "inbox" && counts?.new ? "txt-compact-xsmall-plus" : "txt-compact-xsmall"}>{n}</span>}
              </button>
            )
          })}
        </nav>
        <div className="hidden flex-col gap-1 px-3 md:flex">
          <Text size="xsmall" className="truncate text-ui-fg-subtle" title={s.email ?? ""}>
            {s.email}
          </Text>
          <Text size="xsmall" className={s.last_error ? "text-ui-fg-error" : "text-ui-fg-muted"}>
            {s.last_error ? s.last_error : `Checked ${ago(s.last_sync_at)}`}
          </Text>
          <button type="button" onClick={() => setHelp(true)} className="mt-2 flex items-center gap-1.5 txt-compact-xsmall text-ui-fg-subtle hover:text-ui-fg-base">
            <Keyboard />
            Keyboard shortcuts
          </button>
        </div>
      </div>

      {/* Conversations */}
      <Container className="flex min-w-0 flex-col p-0">
        <div className="flex items-center gap-2 border-b border-ui-border-base px-3 py-2">
          <div className="flex items-center">
            <Checkbox
              aria-label={all ? "Untick all" : "Tick all"}
              checked={all ? true : some ? "indeterminate" : false}
              onCheckedChange={() => setSelected(all || some ? new Set() : new Set(ids))}
              className="mx-1"
            />
            <IconButton size="2xsmall" variant="transparent" aria-label="Tick…" aria-haspopup="menu" onClick={(e) => menu.openFrom(e.currentTarget, selectMenu())}>
              <ChevronDown />
            </IconButton>
          </div>
          {ticked.length ? (
            <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Ticked conversations" data-bulk>
              {ticked.every((t) => t.state === "done") ? (
                <Button size="small" variant="secondary" onClick={() => run(ticked, "inbox")} title="Move to inbox (E)">
                  <InboxSolid />
                  <span className="hidden lg:inline">To inbox</span>
                </Button>
              ) : (
                <Button size="small" variant="secondary" onClick={() => run(ticked, "done")} title="Mark as answered (E)">
                  <CheckCircle />
                  <span className="hidden lg:inline">Answered</span>
                </Button>
              )}
              {ticked.some((t) => t.unread > 0) ? (
                <Button size="small" variant="secondary" onClick={() => run(ticked, "read")} title="Mark as read (U)">
                  <Envelope />
                  <span className="hidden lg:inline">Read</span>
                </Button>
              ) : (
                <Button size="small" variant="secondary" onClick={() => run(ticked, "unread")} title="Mark as unread (U)">
                  <EnvelopeSolid />
                  <span className="hidden lg:inline">Unread</span>
                </Button>
              )}
              <Button size="small" variant="secondary" onClick={() => run(ticked, ticked.some((t) => t.starred) ? "unstar" : "star")} title="Star (S)">
                {ticked.some((t) => t.starred) ? <StarSolid /> : <Star />}
                <span className="hidden lg:inline">{ticked.some((t) => t.starred) ? "Unstar" : "Star"}</span>
              </Button>
              <Button size="small" variant="secondary" onClick={() => run(ticked, "delete")} title="Delete (#)">
                <Trash />
                <span className="hidden lg:inline">Delete</span>
              </Button>
              <Text size="xsmall" className="ml-1 text-ui-fg-subtle">
                {ticked.length} ticked
              </Text>
            </div>
          ) : (
            <IconButton size="small" variant="transparent" aria-label="Check for new emails" title="Check for new emails" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <ArrowPath className={sync.isPending || isFetching ? "animate-spin" : ""} />
            </IconButton>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
              <input
                ref={search}
                type="search"
                aria-label="Search emails"
                placeholder="Search mail"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQInput("")
                    e.currentTarget.blur()
                  } else if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault()
                    e.currentTarget.blur()
                    rowRefs.current[0]?.focus()
                    setCursor(0)
                  }
                }}
                className="h-8 w-44 rounded-full bg-ui-bg-field pl-8 pr-3 txt-compact-small shadow-borders-base outline-none placeholder:text-ui-fg-muted focus:w-64 focus:shadow-borders-interactive-with-active lg:w-56"
              />
            </div>
            {!!data && data.count > 0 && (
              <Text size="xsmall" className="whitespace-nowrap text-ui-fg-subtle">
                {offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}
              </Text>
            )}
            <IconButton size="small" variant="transparent" aria-label="Newer" disabled={!data || offset === 0} onClick={() => data && setOffset(Math.max(0, offset - data.limit))}>
              <ChevronLeft />
            </IconButton>
            <IconButton size="small" variant="transparent" aria-label="Older" disabled={!data || offset + data.limit >= data.count} onClick={() => data && setOffset(offset + data.limit)}>
              <ChevronRight />
            </IconButton>
          </div>
        </div>
        <div className="border-b border-ui-border-base px-3 py-2 sm:hidden">
          <Input size="small" type="search" placeholder="Search mail" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>

        {isLoading ? (
          <Text size="small" className="px-6 py-6">
            Loading…
          </Text>
        ) : !threads.length ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="text-ui-fg-muted">{info.icon}</span>
            <Text size="small" className="text-ui-fg-subtle">
              {q ? `Nothing matches “${q}”.` : info.empty}
            </Text>
            {q && (
              <Button size="small" variant="transparent" onClick={() => setQInput("")}>
                Clear the search
              </Button>
            )}
          </div>
        ) : (
          <div role="list" aria-label={info.label}>
            {threads.map((t, i) => (
              <Row
                key={t.id}
                t={t}
                folder={folder}
                rowRef={(el) => (rowRefs.current[i] = el)}
                current={i === cursor}
                ticked={selected.has(t.id)}
                onOpen={() => setOpen(t.id)}
                onTick={(shift) => toggle(i, shift)}
                onFocus={() => setCursor(i)}
                onMenu={(e) => {
                  setCursor(i)
                  menu.open(e, rowMenu(t))
                }}
                onMore={(el) => {
                  setCursor(i)
                  menu.openFrom(el, rowMenu(t))
                }}
                onAct={(a) => run([t], a)}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-ui-border-base px-4 py-2 md:hidden">
          <Text size="xsmall" className={s.last_error ? "text-ui-fg-error" : "text-ui-fg-muted"}>
            {s.last_error ? s.last_error : `Checked ${ago(s.last_sync_at)}`}
          </Text>
          <Button size="small" variant="transparent" onClick={() => sync.mutate()} isLoading={sync.isPending}>
            <ArrowPath />
            Check now
          </Button>
        </div>
      </Container>

      {open && (
        <ThreadView
          id={open}
          ids={ids}
          start={start}
          act={act}
          suggestions={suggestions}
          onNavigate={(id) => setOpen(id)}
          onClose={() => setOpen(null)}
          onFind={find}
        />
      )}
      {composing && <ComposeDrawer suggestions={suggestions} onClose={() => setComposing(false)} />}
      {help && (
        <Drawer open onOpenChange={(o) => !o && setHelp(false)}>
          <Drawer.Content className="max-w-[420px]">
            <Drawer.Header>
              <Drawer.Title>Keyboard shortcuts</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-1 overflow-y-auto">
              <Text size="small" className="mb-2 text-ui-fg-subtle">
                Like Gmail. They work when you're not typing in a box. Press ? to see this again.
              </Text>
              {SHORTCUTS.map(([k, what]) => (
                <div key={k} className="flex items-center justify-between gap-4 border-b border-ui-border-base py-2 last:border-0">
                  <Text size="small">{what}</Text>
                  <Kbd>{k}</Kbd>
                </div>
              ))}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer>
      )}
    </div>
  )
}

type RowProps = {
  t: Thread
  folder: Folder
  current: boolean
  ticked: boolean
  onOpen: () => void
  onTick: (shift: boolean) => void
  onFocus: () => void
  onMenu: (e: React.MouseEvent) => void
  onMore: (el: HTMLElement) => void
  onAct: (a: Action) => void
}

function Row({ rowRef, t, folder, current, ticked, onOpen, onTick, onFocus, onMenu, onMore, onAct }: RowProps & { rowRef: (el: HTMLDivElement | null) => void }) {
  const unread = t.unread > 0
  const waiting = t.state === "new" || t.state === "open"
  const quick = (label: string, icon: ReactNode, a: Action, disabled = false) => (
    <IconButton
      size="small"
      variant="transparent"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onAct(a)
      }}
    >
      {icon}
    </IconButton>
  )
  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={current ? 0 : -1}
      data-thread={t.id}
      data-unread={unread ? "yes" : "no"}
      aria-label={`${unread ? "Unread, " : ""}${t.name}: ${t.subject}`}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) return onTick(e.shiftKey)
        onOpen()
      }}
      onFocus={onFocus}
      onContextMenu={onMenu}
      className={`group relative flex cursor-pointer items-center gap-2 border-b border-ui-border-base px-3 py-2 outline-none last:border-0 md:py-1.5 ${
        ticked ? "bg-ui-bg-highlight" : unread ? "bg-ui-bg-base" : "bg-ui-bg-subtle"
      } hover:z-[1] hover:shadow-elevation-card-hover focus-visible:shadow-borders-interactive-with-focus`}
    >
      {current && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-ui-fg-interactive" />}
      <div onClick={(e) => e.stopPropagation()} className="flex items-center">
        <Checkbox
          aria-label={`Tick ${t.subject}`}
          checked={ticked}
          onClick={(e) => {
            e.preventDefault()
            onTick(e.shiftKey)
          }}
          className="mx-1"
        />
      </div>
      <button
        type="button"
        aria-label={t.starred ? "Remove star" : "Star"}
        aria-pressed={t.starred}
        data-star={t.starred ? "on" : "off"}
        title={t.starred ? "Starred" : "Not starred"}
        onClick={(e) => {
          e.stopPropagation()
          onAct(t.starred ? "unstar" : "star")
        }}
        className={`rounded p-0.5 ${t.starred ? "text-ui-tag-orange-icon" : "text-ui-fg-muted opacity-60 hover:opacity-100"}`}
      >
        {t.starred ? <StarSolid /> : <Star />}
      </button>
      <Avatar name={t.name} email={t.email} small className="hidden sm:flex" />
      <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
        <div className="flex min-w-0 items-center gap-1 md:w-[190px] md:shrink-0">
          <span className={`truncate txt-compact-small ${unread ? "font-semibold text-ui-fg-base" : "text-ui-fg-subtle"}`}>
            {folder === "sent" && t.last_from_us ? `To: ${t.name || t.email}` : t.name || t.email}
          </span>
          {t.count > 1 && <span className="shrink-0 txt-compact-xsmall text-ui-fg-muted">{t.count}</span>}
          <span className={`ml-auto shrink-0 pl-2 txt-compact-xsmall md:hidden ${unread ? "font-semibold text-ui-fg-base" : "text-ui-fg-subtle"}`}>{shortDate(t.last_date)}</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 txt-compact-small">
          {t.state === "done" && folder !== "done" && (
            <Badge size="2xsmall" color="green" className="shrink-0">
              Answered
            </Badge>
          )}
          {t.state === "sent" && folder !== "sent" && (
            <Badge size="2xsmall" color="purple" className="shrink-0">
              Sent
            </Badge>
          )}
          <span className="truncate">
            <span className={unread ? "font-semibold text-ui-fg-base" : "text-ui-fg-base"}>{t.subject}</span>
            <span className="text-ui-fg-muted">
              {" – "}
              {t.last_from_us ? "You: " : ""}
              {t.snippet}
            </span>
          </span>
        </div>
      </div>
      {t.has_attachments && <PaperClip className="hidden shrink-0 text-ui-fg-muted md:block" />}
      <div className="hidden w-[132px] shrink-0 justify-end md:flex">
        <span
          className={`txt-compact-xsmall group-focus-within:hidden group-hover:hidden ${unread ? "font-semibold text-ui-fg-base" : "text-ui-fg-subtle"}`}
          title={formatWhen(t.last_date)}
        >
          {shortDate(t.last_date)}
        </span>
        <div className="hidden items-center group-focus-within:flex group-hover:flex" data-quick>
          {t.state === "done" ? quick("Move to inbox", <InboxSolid />, "inbox") : quick("Mark as answered", <CheckCircle />, "done", !waiting)}
          {unread ? quick("Mark as read", <Envelope />, "read") : quick("Mark as unread", <EnvelopeSolid />, "unread", t.state === "sent")}
          {quick("Delete", <Trash />, "delete")}
        </div>
      </div>
      <IconButton
        size="small"
        variant="transparent"
        aria-label="More"
        aria-haspopup="menu"
        className="md:hidden"
        onClick={(e) => {
          e.stopPropagation()
          onMore(e.currentTarget)
        }}
      >
        <EllipsisHorizontal />
      </IconButton>
    </div>
  )
}
