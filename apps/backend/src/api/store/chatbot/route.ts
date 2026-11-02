import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ipOf } from "../../../lib/activity"
import { allowedChat, answer, loadChatbot, logTurn, publicChatbot, type Turn } from "../../../lib/chatbot"

// GET /store/chatbot: how the website's chat bubble looks and which buttons it has.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ chatbot: await publicChatbot(req.scope) })
}

const sessionOk = (s: unknown): s is string => typeof s === "string" && /^[\w-]{8,64}$/.test(s)

// POST /store/chatbot { session, text, history?: [{ role, text }], page? }: one answer.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { session?: unknown; text?: unknown; history?: unknown; page?: unknown }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 800) : ""
  if (!text || !sessionOk(body.session)) return res.status(400).json({ message: "Please type a question." })
  const bot = await loadChatbot(req.scope)
  if (!bot.enabled) return res.status(404).json({ message: "The chat isn't available right now." })
  const ip = ipOf(req) ?? "unknown"
  if (!allowedChat(ip)) {
    return res.status(429).json({ message: "You're typing faster than I can read! Please wait a minute and try again." })
  }
  const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is Turn => !!t && typeof t === "object" && (t.role === "user" || t.role === "bot") && typeof t.text === "string")
    .slice(-8)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 800) }))
  const reply = await answer(req.scope, text, history, bot)
  const page = typeof body.page === "string" ? body.page : null
  logTurn(
    req.scope,
    body.session,
    [
      { role: "user", text },
      { role: "bot", text: reply.text + (reply.products?.length ? `\n[showed: ${reply.products.join(", ")}]` : ""), source: reply.source },
    ],
    { page, ip, ai: reply.source === "ai" }
  ).catch((e) => req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`Chat bot log failed: ${(e as Error).message}`))
  res.json({ reply })
}
