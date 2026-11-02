import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../modules/content"
import type ContentModuleService from "../../../modules/content/service"

// GET /admin/contact-messages?status=new&q=priya&offset=0: Contact page messages, newest first.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const status = typeof req.query.status === "string" && ["new", "read", "done"].includes(req.query.status) ? req.query.status : undefined
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : ""
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (q) {
    const like = { $ilike: `%${q.replace(/[%_]/g, "")}%` }
    filters.$or = [{ name: like }, { email: like }, { phone: like }, { topic: like }]
  }
  const [messages, count] = await content.listAndCountContactMessages(filters as never, {
    order: { created_at: "DESC" },
    skip: offset,
    take: 30,
  })
  const unreadCount = (await content.listAndCountContactMessages({ status: "new" } as never, { take: 1, select: ["id"] }))[1]
  res.json({ messages, count, offset, limit: 30, unread: unreadCount })
}
