import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { explainMailError, setServerFlags, trashMail } from "../../../../lib/mailbox"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"
import type { MailActionBodyType } from "../../validators"

type Row = Record<string, any>

// POST /admin/mailbox/actions { ids: conversation ids, action }
//   read / unread    – read or unread (here and in the webmail)
//   done / inbox     – answered (leaves the inbox) / back in the inbox
//   star / unstar    – starred (flagged in the webmail)
//   delete           – moved to the mailbox's Trash
export const POST = async (req: AuthenticatedMedusaRequest<MailActionBodyType>, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const { ids, action } = req.validatedBody
  const rows = (await content.listMailMessages({ thread_id: ids } as never, {
    take: 5000,
    order: { date: "ASC" },
    select: ["id", "thread_id", "folder", "uid", "uidvalidity", "status", "starred"],
  })) as Row[]
  if (!rows.length) return res.json({ ok: true, changed: 0 })
  const inbox = rows.filter((r) => r.folder === "inbox")
  const set = (list: Row[], patch: Row) => (list.length ? content.updateMailMessages(list.map((r) => ({ id: r.id, ...patch })) as never) : null)

  switch (action) {
    case "read":
      await set(inbox.filter((r) => r.status === "new"), { status: "read" })
      void setServerFlags(req.scope, inbox, ["\\Seen"])
      break
    case "unread": {
      // Like a phone mail app: the newest email they sent becomes unread again.
      const latest = new Map<string, Row>()
      for (const r of inbox) latest.set(r.thread_id, r)
      const pick = [...latest.values()]
      await set(pick, { status: "new" })
      void setServerFlags(req.scope, pick, ["\\Seen"], true)
      break
    }
    case "done":
      await set(inbox.filter((r) => r.status !== "done"), { status: "done" })
      void setServerFlags(req.scope, inbox, ["\\Seen"])
      break
    case "inbox":
      await set(inbox.filter((r) => r.status === "done"), { status: "read" })
      break
    case "star": {
      // The newest email of each conversation carries the star.
      const latest = new Map<string, Row>()
      for (const r of rows) latest.set(r.thread_id, r)
      const pick = [...latest.values()].filter((r) => !r.starred)
      await set(pick, { starred: true })
      void setServerFlags(req.scope, pick, ["\\Flagged"])
      break
    }
    case "unstar": {
      const pick = rows.filter((r) => r.starred)
      await set(pick, { starred: false })
      void setServerFlags(req.scope, pick, ["\\Flagged"], true)
      break
    }
    case "delete":
      try {
        await trashMail(req.scope, rows)
      } catch (e) {
        const m = (e as Error).message
        return res.status(400).json({ ok: false, message: /Trash|isn't connected/.test(m) ? m : explainMailError(e) })
      }
      break
  }
  res.json({ ok: true, changed: new Set(rows.map((r) => r.thread_id)).size })
}
