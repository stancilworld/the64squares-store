import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { answer, clearChatbotCache, loadChatbot } from "../../../../lib/chatbot"

// POST /admin/chatbot/try { text }: what the bot would answer (not saved in Past chats).
// Uses the saved settings, even when the bot is switched off on the website.
export const POST = async (req: AuthenticatedMedusaRequest<{ text: string }>, res: MedusaResponse) => {
  clearChatbotCache()
  const bot = await loadChatbot(req.scope)
  const reply = await answer(req.scope, req.validatedBody.text, [], bot)
  res.json({ reply })
}
