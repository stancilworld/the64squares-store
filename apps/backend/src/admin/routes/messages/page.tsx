import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircle, ChatBubbleLeftRight, EllipsisHorizontal, Envelope, EnvelopeSolid, InboxSolid, Phone, SquareTwoStack, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, IconButton, Input, Label, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { formatWhen } from "../../lib/dates"
import { useContextMenu, type MenuItem } from "../../lib/context-menu"
import { ComposeDrawer, copyText, MailInbox } from "../../lib/mail-inbox"
import { sdk } from "../../lib/sdk"
import { useMe } from "../../lib/staff"

type Message = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  topic: string | null
  answers: { id: string; label: string; type: string; value: string }[]
  status: "new" | "read" | "done"
  note: string | null
  created_at: string
}
type ListResponse = { messages: Message[]; count: number; offset: number; limit: number; unread: number }

const STATUS: Record<Message["status"], { label: string; color: "blue" | "grey" | "green" }> = {
  new: { label: "New", color: "blue" },
  read: { label: "Read", color: "grey" },
  done: { label: "Answered", color: "green" },
}
const FILTERS: { value: "" | Message["status"]; label: string }[] = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "done", label: "Answered" },
]

const waLink = (phone: string) => {
  let d = phone.replace(/\D/g, "")
  if (d.length === 10) d = `91${d}`
  return `https://wa.me/${d}`
}

const replySubject = (m: Message) => `Re: your message to The64Squares${m.topic ? ` (${m.topic})` : ""}`

// Answering, marking and deleting form messages: the same from the list, the right-click
// menu and the open message.
function useFormActions() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const { can } = useMe()
  const mailbox = useQuery({
    queryKey: ["mailbox", "status"],
    queryFn: () => sdk.client.fetch<{ connected: boolean }>("/admin/mailbox"),
    enabled: can("mailbox.view"),
  })
  const [replying, setReplying] = useState<Message | null>(null)
  const update = (m: Message, body: { status?: Message["status"]; note?: string | null }, done?: string) =>
    sdk.client
      .fetch(`/admin/contact-messages/${m.id}`, { method: "POST", body })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["contact-messages"] })
        if (done) toast.success(done)
      })
      .catch((e: Error) => toast.error("Couldn't save", { description: e.message }))
  const remove = async (m: Message, after?: () => void) => {
    if (!(await prompt({ title: "Delete this message?", description: "It can't be brought back.", confirmText: "Delete" }))) return
    await sdk.client.fetch(`/admin/contact-messages/${m.id}`, { method: "DELETE" })
    qc.invalidateQueries({ queryKey: ["contact-messages"] })
    toast.success("Message deleted")
    after?.()
  }
  // From the shop inbox inside the admin when it's connected, else the computer's own mail app.
  const reply = (m: Message) => {
    if (!m.email) return
    if (mailbox.data?.connected) setReplying(m)
    else window.location.href = `mailto:${m.email}?subject=${encodeURIComponent(replySubject(m))}`
  }
  const composer = replying ? (
    <ComposeDrawer
      draftKey={`contact:${replying.id}`}
      preset={{ to: [replying.email!], subject: replySubject(replying) }}
      onSent={() => update(replying, { status: "done" })}
      onClose={() => setReplying(null)}
    />
  ) : null
  const menuFor = (m: Message, open?: () => void, after?: () => void): MenuItem[] => [
    ...(open ? ([{ label: "Open", icon: <Envelope />, onSelect: open }] as MenuItem[]) : []),
    { label: "Reply by email", icon: <Envelope />, onSelect: () => reply(m), disabled: !m.email },
    ...(m.phone
      ? ([
          { label: "Chat on WhatsApp", icon: <ChatBubbleLeftRight />, onSelect: () => window.open(waLink(m.phone!), "_blank", "noopener") },
          { label: "Call", icon: <Phone />, onSelect: () => (window.location.href = `tel:${m.phone!.replace(/\s/g, "")}`) },
        ] as MenuItem[])
      : []),
    "-",
    m.status === "done"
      ? { label: "Mark as not answered", icon: <InboxSolid />, onSelect: () => update(m, { status: "read" }, "Moved back to not answered") }
      : { label: "Mark as answered", icon: <CheckCircle />, onSelect: () => update(m, { status: "done" }, "Marked as answered") },
    m.status === "new"
      ? { label: "Mark as read", icon: <Envelope />, onSelect: () => update(m, { status: "read" }) }
      : { label: "Mark as unread", icon: <EnvelopeSolid />, onSelect: () => update(m, { status: "new" }) },
    "-",
    { label: m.email ? `Copy ${m.email}` : "Copy email address", icon: <SquareTwoStack />, onSelect: () => copyText(m.email!, "Email address"), disabled: !m.email },
    { label: m.phone ? `Copy ${m.phone}` : "Copy phone number", icon: <SquareTwoStack />, onSelect: () => copyText(m.phone!, "Phone number"), disabled: !m.phone },
    "-",
    { label: "Delete", icon: <Trash />, danger: true, onSelect: () => remove(m, after) },
  ]
  return { update, remove, reply, composer, menuFor }
}

function MessageDrawer({ message, onClose, actions }: { message: Message | null; onClose: () => void; actions: ReturnType<typeof useFormActions> }) {
  const qc = useQueryClient()
  const [note, setNote] = useState("")
  const menu = useContextMenu()
  useEffect(() => setNote(message?.note ?? ""), [message])

  const update = useMutation({
    mutationFn: (body: { status?: Message["status"]; note?: string | null }) =>
      sdk.client.fetch(`/admin/contact-messages/${message!.id}`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-messages"] }),
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })

  // Opening a new message marks it as read.
  useEffect(() => {
    if (message?.status === "new") update.mutate({ status: "read" })
  }, [message?.id])

  if (!message) return null
  return (
    <Drawer open={!!message} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[640px]" onEscapeKeyDown={(e) => menu.isOpen && e.preventDefault()}>
        {menu.element}
        <Drawer.Header>
          <Drawer.Title>{message.name || message.email || "Message"}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <Text size="small" className="text-ui-fg-subtle">
            {formatWhen(message.created_at)}
          </Text>
          <div className="flex flex-wrap gap-2">
            {message.email && (
              <Button size="small" onClick={() => actions.reply(message)}>
                <Envelope />
                Reply by email
              </Button>
            )}
            {message.phone && (
              <>
                <Button size="small" variant="secondary" asChild>
                  <a href={waLink(message.phone)} target="_blank" rel="noreferrer" data-keep>
                    <ChatBubbleLeftRight />
                    WhatsApp
                  </a>
                </Button>
                <Button size="small" variant="secondary" asChild>
                  <a href={`tel:${message.phone.replace(/\s/g, "")}`} data-keep>
                    <Phone />
                    Call
                  </a>
                </Button>
              </>
            )}
            <IconButton size="small" variant="transparent" aria-label="More" aria-haspopup="menu" onClick={(e) => menu.openFrom(e.currentTarget, actions.menuFor(message, undefined, onClose))}>
              <EllipsisHorizontal />
            </IconButton>
          </div>
          <dl className="divide-y rounded-lg border border-ui-border-base">
            {message.answers.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <dt className="txt-compact-xsmall text-ui-fg-subtle">{a.label}</dt>
                <dd className="whitespace-pre-wrap break-words txt-small">{a.value || "–"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="msg-note" size="small">
              Note for the team (only seen here)
            </Label>
            <Textarea id="msg-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called back, sending a replacement part" />
          </div>
        </Drawer.Body>
        <Drawer.Footer className="flex-wrap">
          <Button variant="danger" className="mr-auto" onClick={() => actions.remove(message, onClose)}>
            <Trash />
            Delete
          </Button>
          {message.status !== "done" ? (
            <Button
              variant="secondary"
              onClick={() => update.mutate({ status: "done", note: note || null }, { onSuccess: () => (toast.success("Marked as answered"), onClose()) })}
            >
              Mark as answered
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => update.mutate({ status: "read" })}>
              Mark as not answered
            </Button>
          )}
          <Button isLoading={update.isPending} onClick={() => update.mutate({ note: note || null }, { onSuccess: () => toast.success("Note saved") })}>
            Save note
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const ContactMessages = () => {
  const [params, setParams] = useSearchParams()
  const actions = useFormActions()
  const menu = useContextMenu()
  const [filter, setFilter] = useState<"" | Message["status"]>("")
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const { data, isLoading } = useQuery({
    queryKey: ["contact-messages", filter, q, offset],
    queryFn: () => sdk.client.fetch<ListResponse>("/admin/contact-messages", { query: { status: filter || undefined, q: q || undefined, offset } }),
    refetchInterval: 60_000,
  })
  const openId = params.get("open")
  const [open, setOpen] = useState<Message | null>(null)
  // A link from the email (…/messages?open=id) opens that message.
  useEffect(() => {
    if (!openId || open) return
    const hit = data?.messages.find((m) => m.id === openId)
    if (hit) setOpen(hit)
  }, [openId, data, open])

  return (
    <div className="flex flex-col gap-y-3">
      {menu.element}
      {actions.composer}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <Heading level="h1">Messages</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Sent with the form on the Contact page. Each one is also emailed to you. Right-click a message for every action, or open it to reply.
            </Text>
          </div>
          <Button size="small" variant="secondary" asChild>
            <Link to="/website/contact">Edit the form</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.label}
                size="small"
                variant={filter === f.value ? "primary" : "transparent"}
                onClick={() => {
                  setFilter(f.value)
                  setOffset(0)
                }}
              >
                {f.label}
                {f.value === "new" && !!data?.unread && ` (${data.unread})`}
              </Button>
            ))}
          </div>
          <Input
            size="small"
            type="search"
            className="w-60"
            placeholder="Search name, email, phone, topic"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOffset(0)
            }}
          />
        </div>
        {isLoading ? (
          <Text size="small" className="px-6 py-4">
            Loading…
          </Text>
        ) : !data?.messages.length ? (
          <Text size="small" className="px-6 py-8 text-center text-ui-fg-subtle">
            {filter || q ? "No messages match." : "No messages yet. They'll appear here when someone uses the Contact page form."}
          </Text>
        ) : (
          data.messages.map((m) => {
            const body = m.answers.find((a) => a.type === "textarea")?.value ?? ""
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                data-message={m.id}
                onClick={() => setOpen(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setOpen(m)
                }}
                onContextMenu={(e) => menu.open(e, actions.menuFor(m, () => setOpen(m)))}
                className={`group flex w-full cursor-pointer items-start gap-4 px-6 py-3 text-left outline-none hover:bg-ui-bg-base-hover focus-visible:bg-ui-bg-base-hover ${m.status === "new" ? "" : "bg-ui-bg-subtle"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.status === "new" ? "bg-ui-tag-blue-icon" : "bg-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text size="small" weight={m.status === "new" ? "plus" : "regular"}>
                      {m.name || m.email || "No name"}
                    </Text>
                    {m.topic && (
                      <Badge size="2xsmall" color="grey">
                        {m.topic}
                      </Badge>
                    )}
                  </div>
                  <Text size="xsmall" className="line-clamp-1 text-ui-fg-subtle">
                    {body || m.email || ""}
                  </Text>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 group-focus-within:hidden group-hover:hidden">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {formatWhen(m.created_at)}
                  </Text>
                  <Badge size="2xsmall" color={STATUS[m.status].color}>
                    {STATUS[m.status].label}
                  </Badge>
                </div>
                <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex" data-quick onClick={(e) => e.stopPropagation()}>
                  {m.email && (
                    <IconButton size="small" variant="transparent" aria-label="Reply by email" title="Reply by email" onClick={() => actions.reply(m)}>
                      <Envelope />
                    </IconButton>
                  )}
                  {m.status === "done" ? (
                    <IconButton size="small" variant="transparent" aria-label="Mark as not answered" title="Mark as not answered" onClick={() => actions.update(m, { status: "read" })}>
                      <InboxSolid />
                    </IconButton>
                  ) : (
                    <IconButton size="small" variant="transparent" aria-label="Mark as answered" title="Mark as answered" onClick={() => actions.update(m, { status: "done" }, "Marked as answered")}>
                      <CheckCircle />
                    </IconButton>
                  )}
                  <IconButton size="small" variant="transparent" aria-label="Delete" title="Delete" onClick={() => actions.remove(m)}>
                    <Trash />
                  </IconButton>
                  <IconButton size="small" variant="transparent" aria-label="More" aria-haspopup="menu" onClick={(e) => menu.openFrom(e.currentTarget, actions.menuFor(m, () => setOpen(m)))}>
                    <EllipsisHorizontal />
                  </IconButton>
                </div>
              </div>
            )
          })
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
      <MessageDrawer
        actions={actions}
        message={open}
        onClose={() => {
          setOpen(null)
          if (openId) {
            params.delete("open")
            setParams(params, { replace: true })
          }
        }}
      />
    </div>
  )
}

// Messages: the shop inbox (Email) and Contact page form messages, each shown to staff who
// may see it.
const MessagesPage = () => {
  const { can } = useMe()
  const [params, setParams] = useSearchParams()
  const canMail = can("mailbox.view")
  const canForm = can("messages.view")
  const tab = params.get("tab") === "form" || params.get("open") || !canMail ? "form" : "email"
  const status = useQuery({
    queryKey: ["mailbox", "status"],
    queryFn: () => sdk.client.fetch<{ unread: number }>("/admin/mailbox"),
    enabled: canMail,
    refetchInterval: 60_000,
  })
  const forms = useQuery({
    queryKey: ["contact-messages", "unread"],
    queryFn: () => sdk.client.fetch<{ unread: number }>("/admin/contact-messages", { query: { status: "new" } }),
    enabled: canForm,
    refetchInterval: 60_000,
  })
  const go = (t: "email" | "form") => {
    const next = new URLSearchParams()
    if (t === "form") next.set("tab", "form")
    setParams(next, { replace: true })
  }
  return (
    <div className="flex flex-col gap-y-3">
      {canMail && canForm && (
        <div className="flex gap-1">
          <Button size="small" variant={tab === "email" ? "primary" : "secondary"} onClick={() => go("email")}>
            <Envelope />
            Email{status.data?.unread ? ` (${status.data.unread})` : ""}
          </Button>
          <Button size="small" variant={tab === "form" ? "primary" : "secondary"} onClick={() => go("form")}>
            <ChatBubbleLeftRight />
            Contact form{forms.data?.unread ? ` (${forms.data.unread})` : ""}
          </Button>
        </div>
      )}
      {tab === "email" ? <MailInbox /> : <ContactMessages />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Messages",
  icon: ChatBubbleLeftRight,
  rank: 3,
})

export default MessagesPage
