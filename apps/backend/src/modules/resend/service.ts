import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger, NotificationTypes } from "@medusajs/framework/types"
import { getServiceKeys } from "../../lib/service-keys"

// Sends Stancil's emails (order confirmations, sign-in codes, password resets) through Resend.
// Without an API key (e.g. on a developer's computer) emails are written to the server log
// instead of being sent.

type Options = { api_key?: string; from?: string; api_base?: string }

class ResendNotificationService extends AbstractNotificationProviderService {
  static identifier = "resend"
  protected options_: Options
  protected logger_: Logger

  constructor({ logger }: { logger: Logger }, options: Options) {
    super()
    this.options_ = options
    this.logger_ = logger
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    const content = notification.content
    if (!content?.subject || !(content.html || content.text)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Email needs a subject and a body")
    }
    // Keys from the admin (Settings → Payments & delivery → Keys) or the server's .env.
    const keys = await getServiceKeys()
    const apiKey = keys.resendKey || this.options_.api_key
    const from = notification.from?.trim() || keys.emailFrom || this.options_.from || "Stancil <hello@stancil.in>"
    // Replies (e.g. to an order confirmation) go to a real inbox, not the sending address.
    const own = (content as { reply_to?: unknown }).reply_to
    const replyTo = (typeof own === "string" && own) || keys.emailReplyTo || process.env.EMAIL_REPLY_TO || undefined

    if (!apiKey) {
      this.logger_.info(`[email not sent: no RESEND_API_KEY] to=${notification.to} subject="${content.subject}"\n${content.text ?? ""}`)
      return { id: `log_${Date.now()}` }
    }

    const res = await fetch((this.options_.api_base || "https://api.resend.com").replace(/\/$/, "") + "/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [notification.to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!res.ok) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Resend: ${json.message || res.status}`)
    }
    return { id: json.id }
  }
}

export default ResendNotificationService
