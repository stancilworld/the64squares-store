import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { aiUsageToday, CHATBOT_KEY, clearChatbotCache, DEFAULT_CHATBOT, listCharacters, loadChatbot } from "../../../lib/chatbot"
import { getServiceKeys } from "../../../lib/service-keys"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { ChatbotBodyType } from "../validators"

const extras = async (req: AuthenticatedMedusaRequest) => {
  const ai = (await getServiceKeys(req.scope)).ai
  const characters = (await listCharacters(req.scope).catch(() => [])).map((c) => ({ name: c.name, handle: c.handle, image_url: c.image_url, status: c.status }))
  return { ai_providers: ai.map((p) => ({ provider: p.provider, model: p.model })), ai_used_today: aiUsageToday(), characters }
}

// GET /admin/chatbot: the chat bot's settings, the defaults, and whether an AI key is set.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ chatbot: await loadChatbot(req.scope), defaults: DEFAULT_CHATBOT, ...(await extras(req)) })
}

// POST /admin/chatbot: save all of it (the editor always sends everything).
export const POST = async (req: AuthenticatedMedusaRequest<ChatbotBodyType>, res: MedusaResponse) => {
  await saveSettingWorkflow(req.scope).run({ input: { key: CHATBOT_KEY, value: req.validatedBody as unknown as Record<string, unknown> } })
  clearChatbotCache()
  res.json({ chatbot: await loadChatbot(req.scope), defaults: DEFAULT_CHATBOT, ...(await extras(req)) })
}
