import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"

type Row = Record<string, any>
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

const PAGE = 50

// Conversations, newest first.
// filter: inbox (waiting for a reply), unread, starred, done (answered), sent, all.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const filter = typeof req.query.filter === "string" ? req.query.filter : "inbox"
  const q = typeof req.query.q === "string" ? req.query.q.trim().replace(/[%_]/g, "").slice(0, 100) : ""
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const where: Record<string, unknown> = {}
  if (q) {
    const like = { $ilike: `%${q}%` }
    where.$or = [{ subject: like }, { from_email: like }, { from_name: like }, { reply_to: like }, { snippet: like }]
  }
  const rows = (await content.listMailMessages(where as never, {
    take: 5000,
    order: { date: "DESC" },
    select: ["id", "thread_id", "folder", "status", "starred", "subject", "from_name", "from_email", "reply_to", "to", "date", "snippet", "attachments"],
  })) as Row[]
  const threads = new Map<string, Thread & { them: boolean; ours: boolean }>()
  for (const m of rows) {
    let t = threads.get(m.thread_id)
    if (!t) {
      t = {
        id: m.thread_id,
        subject: m.subject || "(no subject)",
        name: "",
        email: "",
        count: 0,
        last_date: m.date,
        snippet: m.snippet || "",
        state: "sent",
        unread: 0,
        starred: false,
        has_attachments: false,
        last_from_us: m.folder === "sent",
        them: false,
        ours: false,
      }
      threads.set(m.thread_id, t)
    }
    t.count++
    // The conversation keeps the subject it started with (not "Fwd: …" of a later email).
    if (m.subject) t.subject = m.subject
    if (m.starred) t.starred = true
    if (m.folder === "sent") t.ours = true
    if ((m.attachments as unknown[])?.length) t.has_attachments = true
    if (m.folder === "inbox") {
      // The person on the other side: from their newest email. Form messages come from the
      // shop's own sender with the shopper in Reply-To, so show the shopper.
      if (!t.them) {
        const viaForm = m.reply_to && m.reply_to !== m.from_email
        t.email = m.reply_to || m.from_email || ""
        t.name = (viaForm ? m.reply_to : m.from_name) || t.email
        t.them = true
      } else if (t.name === t.email && m.from_name && !(m.reply_to && m.reply_to !== m.from_email)) {
        t.name = m.from_name
      }
      if (m.status === "new") {
        t.unread++
        t.state = "new"
      } else if (m.status === "read" && t.state !== "new") t.state = "open"
      else if (m.status === "done" && t.state === "sent") t.state = "done"
    } else if (!t.them && !t.email) {
      const to = (m.to as Row[])?.[0] ?? {}
      t.email = to.address || ""
      t.name = to.name || to.address || ""
    }
  }
  const list = [...threads.values()]
  const ours = new Set(list.filter((t) => t.ours).map((t) => t.id))
  const all: Thread[] = list.map(({ them, ours: o, ...t }) => (void them, void o, t))
  const waiting = (t: Thread) => t.state === "new" || t.state === "open"
  const pick =
    filter === "unread" || filter === "new" ? all.filter((t) => t.unread > 0)
    : filter === "starred" ? all.filter((t) => t.starred)
    : filter === "done" ? all.filter((t) => t.state === "done")
    : filter === "sent" ? all.filter((t) => ours.has(t.id))
    : filter === "all" ? all
    : all.filter(waiting)
  res.json({
    threads: pick.slice(offset, offset + PAGE),
    count: pick.length,
    offset,
    limit: PAGE,
    counts: {
      new: all.filter((t) => t.unread > 0).length,
      inbox: all.filter(waiting).length,
      starred: all.filter((t) => t.starred).length,
    },
  })
}
