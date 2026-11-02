import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ImapFlow } from "imapflow"
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser"
import nodemailer from "nodemailer"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { getServiceKeys, type MailboxCreds, type MailServer } from "./service-keys"

// The shop's mailbox (e.g. hello@the64squares.in at GoDaddy) inside the admin (Messages → Email).
//
// - Reading: every minute (jobs/sync-mailbox.ts, or "Check now") new emails in the Inbox
//   and Sent folders are copied from the mail server (IMAP) into mail_message.
// - Replying: sent through the mailbox's own server (SMTP) from the shop's address, then
//   filed in its Sent folder, so it looks the same in the Titan app and in the admin.
// - Reading an email in the admin marks it read on the server too, and the other way round.
//
// The mail server stays the original; the admin keeps a copy for fast lists and search.

const STATE_KEY = "mailbox_state"
const FIRST_SYNC = 200 // newest emails copied the first time
const PER_RUN = 100 // at most this many new emails per run (the rest come next minute)
const MAX_SIZE = 25 * 1024 * 1024
const MAX_HTML = 1_500_000

type FolderState = { uidvalidity: string; last_uid: number }
type State = {
  inbox?: FolderState
  sent?: FolderState
  last_sync_at?: string
  last_error?: string | null
  last_error_at?: string | null
}

type Address = { name: string; address: string }
type Row = Record<string, any>

const content = (c: MedusaContainer): ContentModuleService => c.resolve(CONTENT_MODULE)

export const getMailboxState = async (c: MedusaContainer): Promise<State> =>
  ((await content(c).getSettingValue(STATE_KEY)) as State | null) ?? {}

const saveState = async (c: MedusaContainer, patch: State) => {
  const svc = content(c)
  const [existing] = await svc.listSettings({ key: STATE_KEY })
  const value = { ...((existing?.value as State) ?? {}), ...patch }
  if (existing) await svc.updateSettings({ id: existing.id, value })
  else await svc.createSettings({ key: STATE_KEY, value })
}

const local = (s: MailServer) => s.host === "127.0.0.1" || s.host === "localhost"

const imapClient = (m: MailboxCreds) =>
  new ImapFlow({
    host: m.imap.host,
    port: m.imap.port,
    secure: m.imap.secure,
    doSTARTTLS: local(m.imap) ? false : undefined,
    auth: { user: m.email, pass: m.password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  })

const smtpTransport = (m: MailboxCreds) =>
  nodemailer.createTransport({
    host: m.smtp.host,
    port: m.smtp.port,
    secure: m.smtp.secure,
    requireTLS: !m.smtp.secure && !local(m.smtp),
    ignoreTLS: local(m.smtp),
    auth: { user: m.email, pass: m.password },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  })

// Plain-language reasons for the usual connection problems.
export const explainMailError = (e: unknown) => {
  const err = e as { message?: string; authenticationFailed?: boolean; responseCode?: number; code?: string; responseText?: string }
  const msg = `${err.message ?? ""} ${err.responseText ?? ""}`
  if (err.authenticationFailed || err.responseCode === 535 || /auth|credential|login|password/i.test(msg)) {
    return "The mail server didn't accept the email address and password. Check them (sign in to the webmail with the same details to be sure)."
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg) || err.code === "ENOTFOUND") return "The mail server's address couldn't be found. Check the server names."
  if (/ETIMEDOUT|timeout|ECONNREFUSED|ECONNRESET/i.test(msg)) return "Couldn't reach the mail server (it didn't answer). Check the server names and ports, or try again in a minute."
  return `The mail server said: ${(err.message || "unknown error").slice(0, 200)}`
}

// ------------------------------------------------------------------ parsing

const addresses = (a?: AddressObject | AddressObject[]): Address[] =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .flatMap((x) => x.value)
    .filter((v) => v.address)
    .map((v) => ({ name: (v.name || "").slice(0, 120), address: v.address!.toLowerCase().slice(0, 200) }))

const refList = (r?: string | string[]) => (Array.isArray(r) ? r : r ? r.split(/\s+/) : []).filter(Boolean).slice(-20)

export const normSubject = (s?: string | null) =>
  (s ?? "")
    .replace(/^\s*((re|fw|fwd|aw|sv|antw)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()

const snippetOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 180)

const htmlOf = (p: ParsedMail) => {
  if (!p.html) return null
  let html = p.html
  if (html.length > MAX_HTML) html = html.replace(/src="data:[^"]{1000,}"/g, 'src=""')
  return html.length > MAX_HTML ? null : html
}

// Attachments people can download (not pictures inside the email's text).
const attachmentsOf = (p: ParsedMail) =>
  p.attachments
    .map((a, index) => ({ index, filename: a.filename || `attachment-${index + 1}`, content_type: a.contentType, size: a.size, inline: !!a.related }))
    .filter((a) => !a.inline)
    .map(({ inline, ...a }) => (void inline, a))

// The conversation an email belongs to: the one it replies to, else the same subject with
// the same person in the last 60 days, else a new one.
const threadFor = async (c: MedusaContainer, row: { message_id: string | null; in_reply_to: string | null; references: string[]; subject: string | null; counterpart: string | null; date: Date }) => {
  const svc = content(c)
  const refs = [row.in_reply_to, ...row.references].filter((x): x is string => !!x)
  if (refs.length) {
    const [hit] = await svc.listMailMessages({ message_id: refs } as never, { take: 1, select: ["thread_id"] })
    if (hit) return hit.thread_id as string
  }
  const subj = normSubject(row.subject)
  if (subj && row.counterpart) {
    const since = new Date(row.date.getTime() - 60 * 86_400_000)
    const recent = (await svc.listMailMessages({ date: { $gte: since } } as never, { take: 500, order: { date: "DESC" }, select: ["thread_id", "subject", "from_email", "to", "folder"] })) as Row[]
    const same = recent.find(
      (m) =>
        normSubject(m.subject) === subj &&
        (m.from_email === row.counterpart || ((m.to as Address[]) ?? []).some((t) => t.address === row.counterpart))
    )
    if (same) return same.thread_id as string
  }
  return row.message_id || `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const store = async (c: MedusaContainer, folder: "inbox" | "sent", uidvalidity: string, uid: number, flags: Set<string>, p: ParsedMail, internalDate?: Date) => {
  const svc = content(c)
  const from = addresses(p.from)[0]
  const to = addresses(p.to)
  const cc = addresses(p.cc)
  const message_id = p.messageId?.slice(0, 500) ?? null
  if (message_id) {
    const [dupe] = await svc.listMailMessages({ message_id, folder } as never, { take: 1, select: ["id", "uid"] })
    if (dupe) {
      if (!dupe.uid) await svc.updateMailMessages({ id: dupe.id, uid, uidvalidity } as never)
      return null
    }
  }
  const date = p.date && !Number.isNaN(p.date.getTime()) ? p.date : internalDate ?? new Date()
  const references = refList(p.references)
  const in_reply_to = (Array.isArray(p.inReplyTo) ? p.inReplyTo[0] : p.inReplyTo)?.slice(0, 500) ?? null
  const counterpart = folder === "inbox" ? from?.address ?? null : to[0]?.address ?? null
  const text = (p.text ?? "").slice(0, 200_000)
  const thread_id = await threadFor(c, { message_id, in_reply_to, references, subject: p.subject ?? null, counterpart, date })
  return svc.createMailMessages({
    folder,
    uid,
    uidvalidity,
    message_id,
    in_reply_to,
    references,
    thread_id,
    from_name: from?.name || null,
    from_email: from?.address ?? null,
    reply_to: addresses(p.replyTo)[0]?.address ?? null,
    to,
    cc,
    subject: p.subject?.slice(0, 500) ?? null,
    text,
    html: htmlOf(p),
    snippet: snippetOf(text) || null,
    date,
    status: folder === "sent" || flags.has("\\Seen") ? "read" : "new",
    starred: flags.has("\\Flagged"),
    attachments: attachmentsOf(p),
  } as never)
}

// ------------------------------------------------------------------ sync

const RECHECK = 400 // newest emails per folder whose flags are compared on every sync

const mirrorChanges = async (c: MedusaContainer, client: ImapFlow, folder: "inbox" | "sent", uidvalidity: string) => {
  const svc = content(c)
  const rows = (await svc.listMailMessages({ folder, uidvalidity, uid: { $ne: null } } as never, {
    take: RECHECK,
    order: { uid: "DESC" },
    select: ["id", "uid", "status", "starred", "updated_at"],
  })) as Row[]
  if (!rows.length) return
  const byUid = new Map(rows.map((r) => [r.uid as number, r]))
  const present = new Set<number>()
  const changes: Row[] = []
  for await (const m of client.fetch(rows.map((r) => r.uid).join(","), { uid: true, flags: true }, { uid: true })) {
    const r = byUid.get(m.uid)
    if (!r) continue
    present.add(m.uid)
    // Just changed in the admin: the server may not have caught up yet.
    if (Date.now() - new Date(r.updated_at).getTime() < 120_000) continue
    const flags = m.flags ?? new Set<string>()
    const patch: Row = {}
    if (folder === "inbox" && r.status === "new" && flags.has("\\Seen")) patch.status = "read"
    if (folder === "inbox" && r.status !== "new" && !flags.has("\\Seen")) patch.status = "new"
    if (!!r.starred !== flags.has("\\Flagged")) patch.starred = flags.has("\\Flagged")
    if (Object.keys(patch).length) changes.push({ id: r.id, ...patch })
  }
  if (changes.length) await svc.updateMailMessages(changes as never)
  // Gone from the server folder (deleted or moved in the webmail): gone here too.
  const gone = rows.filter((r) => !present.has(r.uid)).map((r) => r.id as string)
  if (gone.length && gone.length < rows.length) await svc.deleteMailMessages(gone)
}

const sentPathOf = async (client: ImapFlow) => {
  const list = await client.list()
  const special = list.find((b) => b.specialUse === "\\Sent")
  if (special) return special.path
  return list.find((b) => /^(inbox[./])?(sent|sent items|sent mail|sent messages)$/i.test(b.path))?.path ?? null
}

const syncFolder = async (c: MedusaContainer, client: ImapFlow, path: string, folder: "inbox" | "sent", prev?: FolderState) => {
  const lock = await client.getMailboxLock(path)
  let added = 0
  try {
    const box = client.mailbox
    if (!box) return { state: prev, added }
    const uidvalidity = String(box.uidValidity)
    const fresh = !prev || prev.uidvalidity !== uidvalidity
    let last = fresh ? 0 : prev!.last_uid
    if (!box.exists) return { state: { uidvalidity, last_uid: last }, added }

    // Which emails are new (uids only, cheap).
    const found: { uid: number; size: number; flags: Set<string>; internalDate?: Date }[] = []
    const range = fresh ? `${Math.max(1, box.exists - FIRST_SYNC + 1)}:*` : `${last + 1}:*`
    for await (const m of client.fetch(range, { uid: true, flags: true, size: true, internalDate: true }, { uid: !fresh })) {
      if (m.uid > last) found.push({ uid: m.uid, size: m.size ?? 0, flags: m.flags ?? new Set(), internalDate: m.internalDate as Date | undefined })
    }
    found.sort((a, b) => a.uid - b.uid)
    for (const m of found.slice(0, PER_RUN)) {
      try {
        if (m.size > MAX_SIZE) {
          const head = await client.fetchOne(String(m.uid), { envelope: true }, { uid: true })
          const env = head ? head.envelope : undefined
          const p = {
            subject: `${env?.subject ?? "(no subject)"}`,
            messageId: env?.messageId,
            from: env?.from ? { value: env.from, text: "", html: "" } : undefined,
            to: env?.to ? { value: env.to, text: "", html: "" } : undefined,
            text: "This email is too large to show here. Open it in your webmail.",
            attachments: [],
            date: env?.date,
          } as unknown as ParsedMail
          if (await store(c, folder, uidvalidity, m.uid, m.flags, p, m.internalDate)) added++
        } else {
          const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true })
          if (msg && msg.source) {
            const parsed = await simpleParser(msg.source)
            if (await store(c, folder, uidvalidity, m.uid, m.flags, parsed, m.internalDate)) added++
          }
        }
      } catch (e) {
        c.resolve(ContainerRegistrationKeys.LOGGER).warn(`Mailbox: skipped email ${m.uid} in ${path}: ${(e as Error).message}`)
      }
      last = m.uid
    }

    // Changes made elsewhere (e.g. in the Titan app) show here too: read, starred, and
    // emails deleted or moved out of this folder. Checked for the newest emails.
    await mirrorChanges(c, client, folder, uidvalidity)
    return { state: { uidvalidity, last_uid: last }, added }
  } finally {
    lock.release()
  }
}

// Copies new emails from the server. Safe to call often: only one copy runs at a time.
export const syncMailbox = async (c: MedusaContainer): Promise<{ ok: boolean; added: number; message?: string }> => {
  const keys = await getServiceKeys(c)
  if (!keys.mailbox) return { ok: false, added: 0, message: "The mailbox isn't connected yet." }
  const m = keys.mailbox
  const locking = c.resolve(Modules.LOCKING)
  return locking.execute(
    "mailbox-sync",
    async () => {
      const state = await getMailboxState(c)
      const client = imapClient(m)
      client.on("error", () => {})
      let added = 0
      try {
        await client.connect()
        const inbox = await syncFolder(c, client, "INBOX", "inbox", state.inbox)
        added += inbox.added
        const sentPath = await sentPathOf(client)
        const sent = sentPath ? await syncFolder(c, client, sentPath, "sent", state.sent) : { state: state.sent, added: 0 }
        added += sent.added
        await saveState(c, { inbox: inbox.state, sent: sent.state, last_sync_at: new Date().toISOString(), last_error: null, last_error_at: null })
        return { ok: true, added }
      } catch (e) {
        const message = explainMailError(e)
        await saveState(c, { last_error: message, last_error_at: new Date().toISOString() })
        return { ok: false, added, message }
      } finally {
        await client.logout().catch(() => client.close())
      }
    },
    { timeout: 5 }
  )
}

const trashPathOf = async (client: ImapFlow) => {
  const list = await client.list()
  const special = list.find((b) => b.specialUse === "\\Trash")
  if (special) return special.path
  return list.find((b) => /^(inbox[./])?(trash|deleted|deleted items|deleted messages|bin)$/i.test(b.path))?.path ?? null
}

// Runs `fn` on the stored emails' copies on the server, folder by folder (only those whose
// folder hasn't been reset since they were copied).
const onServer = async (c: MedusaContainer, rows: Row[], fn: (client: ImapFlow, uids: string) => Promise<unknown>) => {
  const m = (await getServiceKeys(c)).mailbox
  const targets = rows.filter((r) => r.uid)
  if (!m || !targets.length) return
  const client = imapClient(m)
  client.on("error", () => {})
  try {
    await client.connect()
    for (const folder of ["inbox", "sent"] as const) {
      const mine = targets.filter((r) => r.folder === folder)
      if (!mine.length) continue
      const path = folder === "inbox" ? "INBOX" : await sentPathOf(client)
      if (!path) continue
      const lock = await client.getMailboxLock(path)
      try {
        const uv = String(client.mailbox ? client.mailbox.uidValidity : "")
        const uids = mine.filter((r) => r.uidvalidity === uv).map((r) => r.uid)
        if (uids.length) await fn(client, uids.join(","))
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

// Marks emails on the server (read, unread, starred…). Best effort: the admin copy is
// already updated, and the next sync tells the two apart again.
export const setServerFlags = async (c: MedusaContainer, rows: Row[], flags: string[], remove = false) => {
  try {
    await onServer(c, rows, (client, uids) =>
      remove ? client.messageFlagsRemove(uids, flags, { uid: true }) : client.messageFlagsAdd(uids, flags, { uid: true })
    )
  } catch (e) {
    c.resolve(ContainerRegistrationKeys.LOGGER).warn(`Mailbox: couldn't update flags: ${(e as Error).message}`)
  }
}

// Deleting: the emails move to the mailbox's Trash folder (they can still be brought back
// from the webmail for a while) and leave the admin.
export const trashMail = async (c: MedusaContainer, rows: Row[]) => {
  if (rows.some((r) => r.uid)) {
    const m = (await getServiceKeys(c)).mailbox
    if (!m) throw new Error("The mailbox isn't connected.")
    const probe = imapClient(m)
    probe.on("error", () => {})
    let trash: string | null = null
    try {
      await probe.connect()
      trash = await trashPathOf(probe)
    } finally {
      await probe.logout().catch(() => probe.close())
    }
    if (!trash) throw new Error("Your mailbox has no Trash folder, so nothing was deleted. Delete it in the webmail instead.")
    await onServer(c, rows, (client, uids) => client.messageMove(uids, trash!, { uid: true }))
  }
  await content(c).deleteMailMessages(rows.map((r) => r.id as string))
}

// Downloads attachments of a stored email from the server (the whole email is read once).
export const fetchAttachments = async (c: MedusaContainer, row: Row, indexes: number[]) => {
  const keys = await getServiceKeys(c)
  const m = keys.mailbox
  if (!m || !row.uid) return []
  const client = imapClient(m)
  client.on("error", () => {})
  try {
    await client.connect()
    const path = row.folder === "sent" ? await sentPathOf(client) : "INBOX"
    if (!path) return []
    const lock = await client.getMailboxLock(path)
    try {
      if (String(client.mailbox ? client.mailbox.uidValidity : "") !== row.uidvalidity) return []
      const msg = await client.fetchOne(String(row.uid), { source: true }, { uid: true })
      if (!msg || !msg.source) return []
      const parsed = await simpleParser(msg.source)
      return indexes
        .map((i) => ({ i, a: parsed.attachments[i] }))
        .filter((x) => x.a)
        .map(({ i, a }) => ({ filename: a.filename || `attachment-${i + 1}`, contentType: a.contentType, content: a.content }))
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

// Downloads one attachment of a stored email from the server.
export const fetchAttachment = async (c: MedusaContainer, row: Row, index: number) => (await fetchAttachments(c, row, [index]))[0] ?? null

// ------------------------------------------------------------------ sending

export type OutgoingAttachment = { filename: string; content_type: string; data: string }

export const sendMail = async (
  c: MedusaContainer,
  input: {
    to: string[]
    cc?: string[]
    subject: string
    text: string
    reply_to_id?: string | null
    // Forwarding: the email it came from (stays in the same conversation) and which of its
    // attachments go along.
    forward_id?: string | null
    forward_attachments?: number[]
    attachments?: OutgoingAttachment[]
    sent_by?: string | null
  }
) => {
  const keys = await getServiceKeys(c)
  const m = keys.mailbox
  if (!m) throw new Error("The mailbox isn't connected yet. Add it in Settings → Payments & delivery → Keys.")
  const svc = content(c)
  let original: Row | null = null
  if (input.reply_to_id) {
    original = (await svc.retrieveMailMessage(input.reply_to_id)) as Row
  }
  const forwarded = !original && input.forward_id ? ((await svc.retrieveMailMessage(input.forward_id)) as Row) : null
  const carried = forwarded && input.forward_attachments?.length ? await fetchAttachments(c, forwarded, input.forward_attachments) : []
  if (forwarded && (input.forward_attachments?.length ?? 0) > carried.length) {
    throw new Error("The mailbox couldn't give back the original attachments. Try again, or forward without them.")
  }
  const references = original ? [...((original.references as string[]) ?? []), original.message_id].filter(Boolean) : []
  const textHtml = (t: string) =>
    t
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!).replace(/\n/g, "<br>")}</p>`)
      .join("")

  const mail = {
    from: { name: "The 64 Squares", address: m.email },
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject,
    text: input.text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">${textHtml(input.text)}</div>`,
    inReplyTo: original?.message_id ?? undefined,
    references: references.length ? references.join(" ") : undefined,
    attachments: [
      ...carried.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
      ...(input.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.content_type, content: Buffer.from(a.data, "base64") })),
    ],
  }

  // Build the email once, send exactly those bytes, and file the same bytes in Sent.
  const built = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" }).sendMail(mail)
  const raw = built.message as Buffer
  const envelope = built.envelope as { from: string; to: string[] }
  await smtpTransport(m).sendMail({ envelope, raw })

  let uid: number | null = null
  let uidvalidity: string | null = null
  const client = imapClient(m)
  client.on("error", () => {})
  try {
    await client.connect()
    const sentPath = await sentPathOf(client)
    if (sentPath) {
      const res = await client.append(sentPath, raw, ["\\Seen"])
      if (res && typeof res === "object" && "uid" in res && res.uid) {
        uid = Number(res.uid)
        uidvalidity = String(res.uidValidity)
      }
    }
    if (original?.folder === "inbox" && original.uid) {
      const lock = await client.getMailboxLock("INBOX")
      try {
        if (String(client.mailbox ? client.mailbox.uidValidity : "") === original.uidvalidity) {
          await client.messageFlagsAdd(String(original.uid), ["\\Answered", "\\Seen"], { uid: true })
        }
      } finally {
        lock.release()
      }
    }
  } catch (e) {
    c.resolve(ContainerRegistrationKeys.LOGGER).warn(`Mailbox: sent, but couldn't file it in Sent: ${(e as Error).message}`)
  } finally {
    await client.logout().catch(() => client.close())
  }

  const parsed = await simpleParser(raw)
  const toList = addresses(parsed.to)
  const thread_id = original?.thread_id ?? forwarded?.thread_id ?? (parsed.messageId || `t_${Date.now().toString(36)}`)
  const saved = await svc.createMailMessages({
    folder: "sent",
    uid,
    uidvalidity,
    message_id: parsed.messageId ?? null,
    in_reply_to: original?.message_id ?? null,
    references,
    thread_id,
    from_name: "The 64 Squares",
    from_email: m.email.toLowerCase(),
    reply_to: null,
    to: toList,
    cc: addresses(parsed.cc),
    subject: input.subject,
    text: input.text,
    html: null,
    snippet: snippetOf(input.text),
    date: new Date(),
    status: "read",
    attachments: attachmentsOf(parsed),
    sent_by: input.sent_by ?? null,
  } as never)
  // Answering a conversation marks it done.
  if (original) {
    const open = (await svc.listMailMessages({ thread_id: original.thread_id, folder: "inbox", status: ["new", "read"] } as never, { select: ["id"] })) as Row[]
    if (open.length) await svc.updateMailMessages(open.map((r) => ({ id: r.id, status: "done" })) as never)
  }
  return saved
}

// Checks the saved details by signing in to both servers.
export const testMailbox = async (c: MedusaContainer) => {
  const keys = await getServiceKeys(c)
  const m = keys.mailbox
  if (!m) return { ok: false, message: "Add the inbox email address and password first, then Save." }
  const client = imapClient(m)
  client.on("error", () => {})
  try {
    await client.connect()
    const st = await client.status("INBOX", { messages: true, unseen: true })
    const status = st || { messages: 0, unseen: 0 }
    await client.logout().catch(() => client.close())
    await smtpTransport(m).verify()
    return { ok: true, message: `Connected. ${status.messages ?? 0} emails in the inbox (${status.unseen ?? 0} unread). They'll appear under Messages → Email within a minute.` }
  } catch (e) {
    client.close()
    return { ok: false, message: explainMailError(e) }
  }
}
