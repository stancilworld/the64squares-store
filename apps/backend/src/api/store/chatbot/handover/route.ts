import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ipOf } from "../../../../lib/activity"
import { allowedChat, loadChatbot, logTurn } from "../../../../lib/chatbot"
import { loadContactPage } from "../../../../lib/contact-page"
import { contactMessageEmail, sendEmail } from "../../../../lib/emails"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const PHONE = /^[+()\d\s-]{6,20}$/

// POST /store/chatbot/handover { session, name, email, phone?, message, website? }
// "Leave a message" in the chat: saved with the Contact page messages (admin → Messages →
// Contact form), with the chat so far, and emailed to the team.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  if (typeof b.website === "string" && b.website.trim()) return res.json({ ok: true })
  const bot = await loadChatbot(req.scope)
  if (!bot.enabled || !bot.allow_message) return res.status(404).json({ ok: false, message: "Messages can't be left here right now." })
  const ip = ipOf(req) ?? "unknown"
  if (!allowedChat(`handover:${ip}`, 4, 15 * 60_000)) {
    return res.status(429).json({ ok: false, message: "You've sent a few messages already. Please try again in a little while." })
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
  const name = str(b.name, 120)
  const email = str(b.email, 200).toLowerCase()
  const phone = str(b.phone, 40)
  const message = str(b.message, 3000)
  const errors: Record<string, string> = {}
  if (!name) errors.name = "Please tell us your name."
  if (!EMAIL.test(email)) errors.email = "Please check this email address."
  if (phone && !PHONE.test(phone)) errors.phone = "Please check this number."
  if (!message) errors.message = "Please write your question."
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, message: "Please check the highlighted fields.", errors })

  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const session = typeof b.session === "string" && /^[\w-]{8,64}$/.test(b.session) ? b.session : null
  let transcript = ""
  if (session) {
    const [chat] = await content.listChatSessions({ session_key: session } as never, { take: 1 })
    transcript = ((chat?.messages as unknown as { role: string; text: string }[]) ?? [])
      .slice(-20)
      .map((m) => `${m.role === "user" ? "Shopper" : bot.name}: ${m.text}`)
      .join("\n")
  }
  const answers = [
    { id: "name", label: "Name", type: "text", value: name },
    { id: "email", label: "Email", type: "email", value: email },
    { id: "phone", label: "Phone", type: "phone", value: phone },
    { id: "message", label: "Message", type: "textarea", value: message },
    ...(transcript ? [{ id: "chat", label: "Chat before this", type: "textarea", value: transcript.slice(0, 5000) }] : []),
  ]
  const saved = await content.createContactMessages({
    name,
    email,
    phone: phone || null,
    topic: "Chat on the website",
    answers: answers as never,
    ip: ip.slice(0, 64),
  })
  if (session) void logTurn(req.scope, session, [{ role: "user", text: `Left a message for the team: ${message}`, source: "human" }], { handed_over: true }).catch(() => {})

  const page = await loadContactPage(req.scope)
  if (page.notify_email) {
    const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    sendEmail(
      req.scope,
      page.notify_email,
      "contact-message",
      contactMessageEmail(
        { name, email, topic: "Chat on the website", answers: answers.map((a) => ({ label: a.label, value: a.value })) },
        `${backend}/app/messages?open=${saved.id}`
      ),
      { replyTo: email }
    ).catch((e) => req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Chat message email failed: ${(e as Error).message}`))
  }
  res.json({ ok: true })
}
