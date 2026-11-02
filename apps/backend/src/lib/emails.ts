import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// The 64 Squares's emails: simple, white, black buttons, logo on top. Each function returns the
// subject, an HTML body and a plain-text body. Sent through the Resend provider.

export const storeUrl = () => {
  const fromCors = (process.env.STORE_CORS || "").split(",")[0]?.trim()
  return (process.env.STORE_URL || fromCors || "https://the64squares.in").replace(/\/$/, "")
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export const money = (amount: number, currency = "inr") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 })
    .format(amount)
    .replace(/\.00$/, "")

type Email = { subject: string; html: string; text: string }

const layout = (title: string, inner: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f0;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:24px;padding:32px 28px">
<tr><td style="padding-bottom:20px"><a href="${storeUrl()}"><img src="${storeUrl()}/brand/logo-header.png" alt="The 64 Squares" height="48" style="height:48px;border:0"></a></td></tr>
<tr><td style="font-size:16px;line-height:24px">${inner}</td></tr>
<tr><td style="padding-top:28px;border-top:1px solid #eee;margin-top:28px;font-size:13px;line-height:20px;color:#777">
Questions? Just reply to this email.<br><a href="${storeUrl()}" style="color:#777">the64squares.in</a> · Premium chess sets &amp; tournaments
</td></tr>
</table></td></tr></table></body></html>`

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600">${esc(label)}</a></p>`

export type EmailOrder = {
  id: string
  display_id: number
  email: string
  currency_code: string
  total: number
  item_total?: number
  shipping_total?: number
  tax_total?: number
  payment_method: string
  items: { title: string; variant_title?: string | null; quantity: number; total: number; thumbnail?: string | null }[]
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    phone?: string | null
  } | null
}

const addressText = (a: EmailOrder["shipping_address"]) =>
  a
    ? [
        [a.first_name, a.last_name].filter(Boolean).join(" "),
        a.address_1,
        a.address_2,
        [a.city, a.province, a.postal_code].filter(Boolean).join(", "),
        a.phone ? `Phone: ${a.phone}` : "",
      ].filter(Boolean)
    : []

const itemsHtml = (o: EmailOrder) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
${o.items
  .map(
    (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${
      i.thumbnail ? `<img src="${esc(i.thumbnail)}" width="56" height="56" alt="" style="border-radius:12px;object-fit:cover;vertical-align:middle;margin-right:12px">` : ""
    }<strong>${esc(i.title)}</strong>${i.variant_title ? `<br><span style="color:#777;font-size:14px">${esc(i.variant_title)}</span>` : ""}<br><span style="color:#777;font-size:14px">Qty ${i.quantity}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #eee;white-space:nowrap">${money(i.total, o.currency_code)}</td></tr>`
  )
  .join("")}
<tr><td style="padding:12px 0 4px">Delivery</td><td align="right">${o.shipping_total ? money(o.shipping_total, o.currency_code) : "Free"}</td></tr>
<tr><td style="padding:4px 0;font-weight:700">Total</td><td align="right" style="font-weight:700">${money(o.total, o.currency_code)}</td></tr>
<tr><td colspan="2" style="color:#777;font-size:13px">Includes GST${o.tax_total ? ` of ${money(o.tax_total, o.currency_code)}` : ""}</td></tr>
</table>`

const itemsText = (o: EmailOrder) =>
  o.items.map((i) => `- ${i.title}${i.variant_title ? ` (${i.variant_title})` : ""} x${i.quantity}: ${money(i.total, o.currency_code)}`).join("\n") +
  `\nDelivery: ${o.shipping_total ? money(o.shipping_total, o.currency_code) : "Free"}\nTotal: ${money(o.total, o.currency_code)}`

export const orderPlacedEmail = (o: EmailOrder, invoiceUrl?: string | null): Email => {
  const name = o.shipping_address?.first_name || "there"
  const cod = /cash/i.test(o.payment_method)
  const subject = `Your The 64 Squares order #${o.display_id} is confirmed`
  const link = `${storeUrl()}/order/${o.id}`
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:26px;line-height:32px;margin:0 0 12px">Thank you, ${esc(name)}!</h1>
<p style="margin:0">We've got your order <strong>#${o.display_id}</strong> and we're getting it ready. We'll email you again when it's on its way.</p>
<p style="margin:12px 0 0;color:#555">${cod ? `Payment: <strong>Cash on Delivery</strong>. Please keep ${money(o.total, o.currency_code)} ready when it arrives.` : `Payment: <strong>${esc(o.payment_method)}</strong>, received with thanks.`}</p>
${itemsHtml(o)}
<p style="margin:16px 0 4px;font-weight:600">Delivering to</p>
<p style="margin:0;color:#555">${addressText(o.shipping_address).map(esc).join("<br>")}</p>
${button(link, "View your order")}${invoiceUrl ? `<p style="margin:0"><a href="${invoiceUrl}" style="color:#111">Download your GST invoice</a></p>` : ""}`
    ),
    text: `Thank you, ${name}!\n\nWe've got your order #${o.display_id}.\n${cod ? `Payment: Cash on Delivery. Please keep ${money(o.total, o.currency_code)} ready.` : `Payment: ${o.payment_method}.`}\n\n${itemsText(o)}\n\nDelivering to:\n${addressText(o.shipping_address).join("\n")}\n\nView your order: ${link}${invoiceUrl ? `\nGST invoice: ${invoiceUrl}` : ""}`,
  }
}

export const newOrderForStoreEmail = (o: EmailOrder, adminUrl: string): Email => {
  const subject = `New order #${o.display_id}: ${money(o.total, o.currency_code)} (${o.payment_method})`
  const link = `${adminUrl}/app/orders/${o.id}`
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:22px;margin:0 0 12px">New order #${o.display_id}</h1>
<p style="margin:0">${esc(o.email)} · ${esc(o.payment_method)}</p>
${itemsHtml(o)}
<p style="margin:16px 0 4px;font-weight:600">Ship to</p>
<p style="margin:0;color:#555">${addressText(o.shipping_address).map(esc).join("<br>")}</p>
${button(link, "Open in admin")}`
    ),
    text: `New order #${o.display_id} from ${o.email} (${o.payment_method})\n\n${itemsText(o)}\n\nShip to:\n${addressText(o.shipping_address).join("\n")}\n\n${link}`,
  }
}

export const orderShippedEmail = (o: EmailOrder, tracking: { number?: string; url?: string }[]): Email => {
  const subject = `Your The 64 Squares order #${o.display_id} is on its way`
  const track = tracking.filter((t) => t.number || t.url)
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:26px;line-height:32px;margin:0 0 12px">It's on its way!</h1>
<p style="margin:0">Your order <strong>#${o.display_id}</strong> has been shipped${track.length ? "" : " and should reach you in a few days"}.</p>
${track
  .map((t) => `<p style="margin:12px 0 0">Tracking number: <strong>${esc(t.number ?? "")}</strong></p>${t.url ? button(t.url, "Track your parcel") : ""}`)
  .join("")}
${track.some((t) => t.url) ? "" : button(`${storeUrl()}/order/${o.id}`, "View your order")}`
    ),
    text: `Your order #${o.display_id} has been shipped.\n${track.map((t) => `Tracking: ${t.number ?? ""} ${t.url ?? ""}`).join("\n")}`,
  }
}

export const signInCodeEmail = (code: string): Email => {
  const subject = `${code} is your The 64 Squares code`
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:24px;margin:0 0 12px">Your sign-in code</h1>
<p style="margin:0 0 16px">Enter this code on The 64 Squares website. It works for 10 minutes.</p>
<p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:0 0 16px">${esc(code)}</p>
<p style="margin:0;color:#777;font-size:14px">If you didn't ask for this, you can ignore this email. Nobody can sign in without the code.</p>`
    ),
    text: `Your The 64 Squares code is ${code}. It works for 10 minutes. If you didn't ask for it, ignore this email.`,
  }
}

type ContactAnswer = { label: string; value: string }

const answersHtml = (answers: ContactAnswer[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">${answers
    .map(
      (a) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top"><span style="color:#777;font-size:13px">${esc(a.label)}</span><br><span style="white-space:pre-wrap">${esc(a.value || "–")}</span></td></tr>`
    )
    .join("")}</table>`

const answersText = (answers: ContactAnswer[]) => answers.map((a) => `${a.label}: ${a.value || "-"}`).join("\n")

// To The 64 Squares: a new message from the Contact page. Pressing Reply answers the customer.
export const contactMessageEmail = (m: { name: string | null; email: string | null; topic: string | null; answers: ContactAnswer[] }, adminLink: string): Email => {
  const who = m.name || m.email || "Someone"
  const subject = `New message from ${who}${m.topic ? `: ${m.topic}` : ""}`
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:22px;margin:0 0 4px">New message</h1>
<p style="margin:0;color:#555">From the Contact page. ${m.email ? "Press Reply to answer them." : "They didn't leave an email address."}</p>
${answersHtml(m.answers)}
${button(adminLink, "Open in admin")}`
    ),
    text: `New message from the Contact page\n\n${answersText(m.answers)}\n\n${adminLink}`,
  }
}

// To the customer: we got your message (with a copy of it).
export const contactReceivedEmail = (name: string | null, text: string, answers: ContactAnswer[]): Email => {
  const subject = "We've got your message"
  return {
    subject,
    html: layout(
      subject,
      `<h1 style="font-size:26px;line-height:32px;margin:0 0 12px">Thank you${name ? `, ${esc(name)}` : ""}!</h1>
<p style="margin:0">${esc(text)}</p>
<p style="margin:20px 0 0;font-weight:600">What you sent us</p>
${answersHtml(answers)}`
    ),
    text: `Thank you${name ? `, ${name}` : ""}!\n\n${text}\n\nWhat you sent us:\n${answersText(answers)}`,
  }
}

// Sends an email through the notification module (Resend). Never throws: a failed email
// must not break an order.
export const sendEmail = async (
  container: MedusaContainer,
  to: string,
  template: string,
  email: Email,
  options: { replyTo?: string | null } = {}
): Promise<boolean> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const notifications = container.resolve(Modules.NOTIFICATION)
    await notifications.createNotifications({
      to,
      channel: "email",
      template,
      content: {
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      },
    })
    return true
  } catch (e) {
    logger.error(`Email "${template}" to ${to} failed: ${(e as Error).message}`)
    return false
  }
}
