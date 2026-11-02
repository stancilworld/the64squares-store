import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ipOf } from "../../../lib/activity"
import { checkSubmission, loadContactPage } from "../../../lib/contact-page"
import { contactMessageEmail, contactReceivedEmail, sendEmail } from "../../../lib/emails"
import { CONTENT_MODULE } from "../../../modules/content"
import type ContentModuleService from "../../../modules/content/service"

// POST /store/contact { answers: { [field id]: value }, website?: "" }
// Saves a Contact page message, emails it to Stancil (Reply goes to the customer) and, if
// switched on, sends the customer a copy.

// A few messages per visitor per 15 minutes is plenty; more is a robot.
const WINDOW = 15 * 60_000
const LIMIT = 5
const recent = new Map<string, number[]>()
const allowed = (ip: string) => {
  const now = Date.now()
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (list.length >= LIMIT) return false
  list.push(now)
  recent.set(ip, list)
  if (recent.size > 5000) recent.clear()
  return true
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { answers?: Record<string, unknown>; website?: unknown }
  // A hidden field people can't see; robots fill it in. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim()) {
    return res.json({ ok: true })
  }
  const ip = ipOf(req) ?? "unknown"
  if (!allowed(ip)) {
    return res.status(429).json({ ok: false, message: "You've sent a few messages already. Please try again in a little while." })
  }
  const page = await loadContactPage(req.scope)
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {}
  const check = checkSubmission(page, answers)
  if (Object.keys(check.errors).length) {
    return res.status(400).json({ ok: false, message: "Please check the highlighted fields.", errors: check.errors })
  }
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const saved = await content.createContactMessages({
    name: check.name?.slice(0, 120) ?? null,
    email: check.email?.slice(0, 200) ?? null,
    phone: check.phone?.slice(0, 40) ?? null,
    topic: check.topic?.slice(0, 120) ?? null,
    answers: check.answers as never,
    ip: ip.slice(0, 64),
  })

  const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const shown = check.answers.map((a) => ({ label: a.label, value: a.value }))
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const jobs: Promise<unknown>[] = []
  if (page.notify_email) {
    jobs.push(
      sendEmail(req.scope, page.notify_email, "contact-message", contactMessageEmail({ ...check, answers: shown }, `${backend}/app/messages?open=${saved.id}`), {
        replyTo: check.email,
      })
    )
  }
  if (page.send_copy && check.email) {
    jobs.push(sendEmail(req.scope, check.email, "contact-received", contactReceivedEmail(check.name, page.success_text, shown)))
  }
  Promise.all(jobs).catch((e) => logger.error(`Contact email failed: ${(e as Error).message}`))
  res.json({ ok: true })
}
