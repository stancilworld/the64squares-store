import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../../modules/content"
import type ContentModuleService from "../../../../../modules/content/service"

// GET /admin/chatbot/chats/:id: one chat, every message.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const chat = await content.retrieveChatSession(req.params.id)
  res.json({ chat })
}

// DELETE /admin/chatbot/chats/:id
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  await content.deleteChatSessions(req.params.id)
  res.json({ ok: true })
}
