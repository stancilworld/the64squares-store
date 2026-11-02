import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { setServerFlags } from "../../../../../lib/mailbox"
import { CONTENT_MODULE } from "../../../../../modules/content"
import type ContentModuleService from "../../../../../modules/content/service"
import type { MailThreadBodyType } from "../../../validators"

type Row = Record<string, any>

const load = async (req: AuthenticatedMedusaRequest) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const thread_id = decodeURIComponent(req.params.id)
  const rows = (await content.listMailMessages({ thread_id } as never, { order: { date: "ASC" }, take: 200 })) as Row[]
  if (!rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Conversation not found")
  return { content, thread_id, rows }
}

// GET /admin/mailbox/threads/:id: every email in a conversation, oldest first, plus the
// shopper's account and recent orders when the email address matches one.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { rows } = await load(req)
  const them = rows.find((r) => r.folder === "inbox")
  const email = (them?.reply_to || them?.from_email || (rows[0].to as Row[])?.[0]?.address || "").toLowerCase()
  let customer: Row | null = null
  if (email) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const customers = req.scope.resolve(Modules.CUSTOMER)
    const [c] = await customers.listCustomers({ email }, { take: 1 })
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "created_at", "status", "total", "currency_code"],
      filters: { email },
      pagination: { take: 5, order: { created_at: "DESC" } },
    })
    if (c || orders.length) {
      customer = {
        id: c?.id ?? null,
        name: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null,
        phone: c?.phone ?? null,
        email,
        orders,
      }
    }
  }
  res.json({ messages: rows, customer })
}

// POST /admin/mailbox/threads/:id { status?, note? }: mark the conversation new / read /
// done (also read or unread on the mail server), keep a team note.
export const POST = async (req: AuthenticatedMedusaRequest<MailThreadBodyType>, res: MedusaResponse) => {
  const { content, rows } = await load(req)
  const body = req.validatedBody
  const inbox = rows.filter((r) => r.folder === "inbox")
  if (body.status && inbox.length) {
    await content.updateMailMessages(inbox.map((r) => ({ id: r.id, status: body.status })) as never)
    // On the server: opened or done = read; "mark as new" = unread again.
    void setServerFlags(req.scope, inbox, ["\\Seen"], body.status === "new")
  }
  if (body.note !== undefined) {
    await content.updateMailMessages({ id: rows[rows.length - 1].id, note: body.note } as never)
  }
  res.json({ ok: true })
}
