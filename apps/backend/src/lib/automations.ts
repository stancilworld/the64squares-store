import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { storeUrl } from "./emails"

// Automatic emails (Marketing → Automatic emails): what each says, whether it's on, and when
// it goes. Sent by the "email-automations" job; each one only once per order/cart/customer.

export const AUTOMATIONS_KEY = "email_automations"

export type Mail = {
  enabled: boolean
  subject: string
  heading: string
  // Plain text; a blank line starts a new paragraph. {name}, {code} and {product} are filled in.
  body: string
  button_label: string
  // A discount code included in the email (made in Discounts). Blank: none.
  coupon_code: string
}

export type Automations = {
  welcome: Mail
  abandoned_cart: Mail & { hours: number }
  review_request: Mail & { days: number }
  win_back: Mail & { days: number }
  back_in_stock: Mail
  referral_reward: Mail
}

export const DEFAULT_AUTOMATIONS: Automations = {
  welcome: {
    enabled: false,
    subject: "Welcome to The 64 Squares",
    heading: "Welcome to the club",
    body: "Thank you for joining us. You'll hear about new chess sets, tournaments and offers first.",
    button_label: "Visit the shop",
    coupon_code: "",
  },
  abandoned_cart: {
    enabled: false,
    hours: 3,
    subject: "You left something on the board",
    heading: "Still thinking it over?",
    body: "Hi {name}, your order is waiting. The items below are still in your cart.",
    button_label: "Finish your order",
    coupon_code: "",
  },
  review_request: {
    enabled: false,
    days: 10,
    subject: "How is your new chess set?",
    heading: "How did we do?",
    body: "Hi {name}, we hope you're enjoying {product}. A short review helps other players choose, and helps us make better sets.",
    button_label: "Write a review",
    coupon_code: "",
  },
  win_back: {
    enabled: false,
    days: 90,
    subject: "We've missed you at The 64 Squares",
    heading: "Ready for your next game?",
    body: "Hi {name}, it's been a while. Come and see what's new in the shop.",
    button_label: "See what's new",
    coupon_code: "",
  },
  back_in_stock: {
    enabled: true,
    subject: "{product} is back in stock",
    heading: "It's back",
    body: "Good news: {product} is back in stock. Popular items sell out quickly, so don't wait too long.",
    button_label: "Buy now",
    coupon_code: "",
  },
  referral_reward: {
    enabled: true,
    subject: "Your friend ordered: here is your reward",
    heading: "Thank you for spreading the word",
    body: "Hi {name}, a friend just used your invite code. Here is your reward for your next order.",
    button_label: "Use it in the shop",
    coupon_code: "",
  },
}

export const resolveAutomations = (stored: unknown): Automations => {
  const s = (stored ?? {}) as Partial<Record<keyof Automations, Record<string, unknown>>>
  const out = {} as Record<string, unknown>
  for (const k of Object.keys(DEFAULT_AUTOMATIONS) as (keyof Automations)[]) out[k] = { ...DEFAULT_AUTOMATIONS[k], ...(s[k] ?? {}) }
  return out as Automations
}

export const loadAutomations = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveAutomations(await content.getSettingValue(AUTOMATIONS_KEY))
}

// "Stop these emails" links: signed, so nobody can unsubscribe someone else.
const secret = () => process.env.JWT_SECRET || process.env.COOKIE_SECRET || "dev-secret"
export const unsubscribeSig = (email: string) => crypto.createHmac("sha256", secret()).update(`unsub:${email.toLowerCase()}`).digest("base64url").slice(0, 32)
export const unsubscribeOk = (email: string, sig: string) => {
  const good = Buffer.from(unsubscribeSig(email))
  const given = Buffer.from(sig)
  return good.length === given.length && crypto.timingSafeEqual(good, given)
}
export const unsubscribeUrl = (email: string) => `${storeUrl()}/unsubscribe?e=${encodeURIComponent(email)}&s=${unsubscribeSig(email)}`

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export type MailItem = { title: string; subtitle?: string | null; image?: string | null; href?: string | null }

const fill = (text: string, v: Record<string, string>) => text.replace(/\{(name|code|product)\}/g, (_, k: string) => v[k] ?? "")

// One automatic email from its settings, in the store's email style.
export const buildMail = (
  mail: Mail,
  o: { name?: string | null; product?: string | null; link: string; items?: MailItem[]; code?: string | null; marketing?: { email: string } }
) => {
  const code = (o.code ?? mail.coupon_code).trim()
  const vars = { name: (o.name || "").trim() || "there", product: o.product || "your order", code }
  const subject = fill(mail.subject, vars).replace(/\s+/g, " ").trim()
  const paragraphs = fill(mail.body, vars)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const site = storeUrl()
  const abs = (u?: string | null) => (!u ? null : u.startsWith("http") ? u : `${site}${u.startsWith("/") ? "" : "/"}${u}`)
  const items = (o.items ?? []).slice(0, 6)
  const itemsHtml = items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-top:1px solid #eee">${items
        .map(
          (i) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;width:72px">${
            abs(i.image) ? `<img src="${esc(abs(i.image))}" alt="" width="60" height="60" style="width:60px;height:60px;object-fit:cover;border-radius:4px;background:#f3f1ec">` : ""
          }</td><td style="padding:12px 0 12px 12px;border-bottom:1px solid #eee">${
            i.href ? `<a href="${esc(abs(i.href))}" style="color:#111;font-weight:600;text-decoration:none">${esc(i.title)}</a>` : `<strong>${esc(i.title)}</strong>`
          }${i.subtitle ? `<br><span style="color:#777;font-size:14px">${esc(i.subtitle)}</span>` : ""}</td></tr>`
        )
        .join("")}</table>`
    : ""
  const codeHtml = code
    ? `<p style="margin:20px 0 6px;font-size:14px;color:#555">Your discount code (added at checkout when you use the button):</p><p style="margin:0 0 20px;padding:14px 16px;border:2px dashed #999;border-radius:6px;background:#fff7dc;font-size:22px;font-weight:800;letter-spacing:2px;text-align:center">${esc(code)}</p>`
    : ""
  const link = abs(o.link)!
  const linkWithCode = code ? `${link}${link.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}` : link
  const unsub = o.marketing
    ? `<p style="margin:24px 0 0;font-size:12px;color:#999">You get these emails because you shopped with us or joined our list. <a href="${esc(unsubscribeUrl(o.marketing.email))}" style="color:#999">Stop these emails</a>.</p>`
    : ""
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f3f1ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ec;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;padding:32px 28px">
<tr><td style="padding-bottom:20px"><a href="${site}"><img src="${site}/brand/logo-header.png" alt="The 64 Squares" height="48" style="height:48px;border:0"></a></td></tr>
<tr><td style="font-size:16px;line-height:24px">
<h1 style="font-size:24px;margin:0 0 12px">${esc(fill(mail.heading, vars))}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
${itemsHtml}${codeHtml}
<p style="margin:24px 0"><a href="${esc(linkWithCode)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">${esc(mail.button_label || "Visit the shop")}</a></p>
${unsub}
</td></tr>
<tr><td style="padding-top:28px;border-top:1px solid #eee;font-size:13px;line-height:20px;color:#777">Questions? Just reply to this email.<br><a href="${site}" style="color:#777">the64squares.in</a></td></tr>
</table></td></tr></table></body></html>`
  const text = [
    fill(mail.heading, vars),
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...items.map((i) => `- ${i.title}${i.subtitle ? ` (${i.subtitle})` : ""}`),
    ...(items.length ? [""] : []),
    ...(code ? [`Your code: ${code}`, ""] : []),
    `${mail.button_label || "Visit the shop"}: ${linkWithCode}`,
    ...(o.marketing ? ["", `Stop these emails: ${unsubscribeUrl(o.marketing.email)}`] : []),
  ].join("\n")
  return { subject, html, text }
}
