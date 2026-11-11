import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AUTOMATION_MODULE } from "../modules/automation"
import type AutomationModuleService from "../modules/automation/service"
import { NEWSLETTER_MODULE } from "../modules/newsletter"
import type NewsletterModuleService from "../modules/newsletter/service"
import { countReferralWorkflow, logAutomaticEmailWorkflow, markStockAlertsSentWorkflow, rewardReferralWorkflow } from "../workflows/automations"
import { type Automations, type Mail, type MailItem, buildMail, loadAutomations } from "./automations"
import { sendEmail } from "./emails"
import { recoveryToken } from "./marketing/engine"
import { loadSiteFeatures } from "./site-features"

// The automatic emails, run every 15 minutes by jobs/email-automations.ts. Each email goes
// once (the email log); offers only go to people on the email list who haven't opted out.

const HOUR = 3600_000
const DAY = 24 * HOUR

type Q = { graph: (o: Record<string, unknown>) => Promise<{ data: unknown[] }> }
const q = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.QUERY) as unknown as Q
const auto = (c: MedusaContainer) => c.resolve(AUTOMATION_MODULE) as AutomationModuleService

type Ctx = { c: MedusaContainer; a: Automations; optedOut: Set<string>; subscribed: Set<string> }

const loadCtx = async (c: MedusaContainer): Promise<Ctx> => {
  const [a, outs, subs] = await Promise.all([
    loadAutomations(c),
    auto(c).listEmailLogs({ kind: "opt_out" }, { take: 100000, select: ["key"] }),
    (c.resolve(NEWSLETTER_MODULE) as NewsletterModuleService).listSubscribers({}, { take: 100000, select: ["email"] }),
  ])
  return { c, a, optedOut: new Set(outs.map((o) => o.key)), subscribed: new Set(subs.map((s) => s.email.toLowerCase())) }
}

const alreadySent = async (c: MedusaContainer, kind: string, key: string) => (await auto(c).listEmailLogs({ kind, key }, { take: 1 })).length > 0

// Sends one automatic email unless it went before; then notes it.
const sendOnce = async (ctx: Ctx, kind: string, key: string, to: string, mail: ReturnType<typeof buildMail>) => {
  if (await alreadySent(ctx.c, kind, key)) return false
  const ok = await sendEmail(ctx.c, to, `auto-${kind}`, mail)
  if (ok) await logAutomaticEmailWorkflow(ctx.c).run({ input: { kind, key, email: to } })
  return ok
}

type OrderRow = {
  id: string
  email: string | null
  created_at: string
  status: string
  customer_id: string | null
  item_total?: number | null
  currency_code?: string
  customer?: { first_name?: string | null } | null
  shipping_address?: { first_name?: string | null } | null
  items?: { product_title?: string | null; title?: string | null; variant_title?: string | null; product_handle?: string | null; thumbnail?: string | null }[]
  promotions?: { code?: string | null }[]
}
const ORDER_FIELDS = [
  "id",
  "email",
  "created_at",
  "status",
  "customer_id",
  "item_total",
  "currency_code",
  "customer.first_name",
  "shipping_address.first_name",
  "items.product_title",
  "items.title",
  "items.variant_title",
  "items.product_handle",
  "items.thumbnail",
]

const nameOf = (o: { customer?: { first_name?: string | null } | null; shipping_address?: { first_name?: string | null } | null }) =>
  o.shipping_address?.first_name || o.customer?.first_name || null

const itemsOf = (o: OrderRow, anchor = ""): MailItem[] =>
  (o.items ?? []).map((i) => ({
    title: i.product_title || i.title || "Item",
    subtitle: i.variant_title && i.variant_title !== "Default" ? i.variant_title : null,
    image: i.thumbnail,
    href: i.product_handle ? `/products/${i.product_handle}${anchor}` : null,
  }))

const canMarket = (ctx: Ctx, email: string, optedIn = false) => !ctx.optedOut.has(email) && (optedIn || ctx.subscribed.has(email))

async function welcome(ctx: Ctx) {
  const mail = ctx.a.welcome
  if (!mail.enabled) return 0
  const news = ctx.c.resolve(NEWSLETTER_MODULE) as NewsletterModuleService
  const fresh = await news.listSubscribers({ created_at: { $gte: new Date(Date.now() - 2 * DAY) } } as never, { take: 500 })
  let sent = 0
  for (const s of fresh) {
    const email = s.email.toLowerCase()
    if (ctx.optedOut.has(email)) continue
    if (await sendOnce(ctx, "welcome", email, email, buildMail(mail, { link: "/shop", marketing: { email } }))) sent++
  }
  return sent
}

async function abandonedCarts(ctx: Ctx) {
  const mail = ctx.a.abandoned_cart
  if (!mail.enabled) return 0
  const now = Date.now()
  const { data } = await q(ctx.c).graph({
    entity: "cart",
    fields: ["id", "email", "updated_at", "completed_at", "metadata", "shipping_address.first_name", "items.product_title", "items.title", "items.variant_title", "items.product_handle", "items.thumbnail"],
    filters: { completed_at: null, updated_at: { $lt: new Date(now - mail.hours * HOUR), $gt: new Date(now - (mail.hours + 24) * HOUR) } },
    pagination: { take: 200 },
  })
  let sent = 0
  for (const cart of data as (OrderRow & { updated_at: string; metadata?: Record<string, unknown> | null })[]) {
    const email = cart.email?.toLowerCase()
    if (!email || !(cart.items ?? []).length) continue
    const optedIn = (cart.metadata?.t64_optin as { email?: boolean } | undefined)?.email === true
    if (!canMarket(ctx, email, optedIn)) continue
    // Ordered since (in another checkout), or reminded in the last day: skip.
    const { data: orders } = await q(ctx.c).graph({ entity: "order", fields: ["id"], filters: { email, created_at: { $gte: new Date(new Date(cart.updated_at).getTime() - HOUR) } }, pagination: { take: 1 } })
    if (orders.length) continue
    const [recent] = await auto(ctx.c).listEmailLogs({ kind: "abandoned_cart", email, created_at: { $gte: new Date(now - DAY) } } as never, { take: 1 })
    if (recent) continue
    const m = buildMail(mail, { name: nameOf(cart), link: `/cart/recover/${recoveryToken(cart.id)}`, items: itemsOf(cart), marketing: { email } })
    if (await sendOnce(ctx, "abandoned_cart", cart.id, email, m)) sent++
  }
  return sent
}

async function reviewRequests(ctx: Ctx) {
  const mail = ctx.a.review_request
  if (!mail.enabled) return 0
  const now = Date.now()
  const { data } = await q(ctx.c).graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { created_at: { $lt: new Date(now - mail.days * DAY), $gt: new Date(now - (mail.days + 3) * DAY) } },
    pagination: { take: 300 },
  })
  let sent = 0
  for (const o of data as OrderRow[]) {
    const email = o.email?.toLowerCase()
    if (!email || o.status === "canceled" || ctx.optedOut.has(email)) continue
    const items = itemsOf(o, "#reviews")
    const m = buildMail(mail, { name: nameOf(o), product: items[0]?.title, link: items[0]?.href ?? "/account/orders", items })
    if (await sendOnce(ctx, "review_request", o.id, email, m)) sent++
  }
  return sent
}

async function winBack(ctx: Ctx) {
  const mail = ctx.a.win_back
  if (!mail.enabled) return 0
  const now = Date.now()
  const { data } = await q(ctx.c).graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { created_at: { $lt: new Date(now - mail.days * DAY), $gt: new Date(now - (mail.days + 3) * DAY) } },
    pagination: { take: 300 },
  })
  let sent = 0
  for (const o of data as OrderRow[]) {
    const email = o.email?.toLowerCase()
    if (!email || !canMarket(ctx, email)) continue
    // Only if this was their last order.
    const { data: later } = await q(ctx.c).graph({ entity: "order", fields: ["id"], filters: { email, created_at: { $gt: new Date(o.created_at) } }, pagination: { take: 1 } })
    if (later.length) continue
    if (await sendOnce(ctx, "win_back", `${email}:${o.id}`, email, buildMail(mail, { name: nameOf(o), link: "/shop", marketing: { email } }))) sent++
  }
  return sent
}

type VariantRow = {
  id: string
  title?: string | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  product?: { title?: string | null; handle?: string | null; thumbnail?: string | null; status?: string } | null
  inventory_items?: { required_quantity?: number; inventory?: { location_levels?: { stocked_quantity?: number | null; reserved_quantity?: number | null }[] } | null }[]
}

const inStock = (v: VariantRow) => {
  if (v.product?.status && v.product.status !== "published") return false
  if (!v.manage_inventory || v.allow_backorder) return true
  const items = v.inventory_items ?? []
  if (!items.length) return true
  return items.every((i) => {
    const available = (i.inventory?.location_levels ?? []).reduce((s, l) => s + Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0), 0)
    return available >= Math.max(1, Number(i.required_quantity ?? 1))
  })
}

async function backInStock(ctx: Ctx) {
  const mail = ctx.a.back_in_stock
  if (!mail.enabled || !(await loadSiteFeatures(ctx.c)).back_in_stock.enabled) return 0
  const waiting = await auto(ctx.c).listStockAlerts({ notified_at: null }, { take: 2000 })
  if (!waiting.length) return 0
  const ids = [...new Set(waiting.map((w) => w.variant_id))]
  const { data } = await q(ctx.c).graph({
    entity: "product_variant",
    fields: ["id", "title", "manage_inventory", "allow_backorder", "product.title", "product.handle", "product.thumbnail", "product.status", "inventory_items.required_quantity", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
    filters: { id: ids },
  })
  const back = new Map((data as VariantRow[]).filter(inStock).map((v) => [v.id, v]))
  const done: string[] = []
  for (const w of waiting) {
    const v = back.get(w.variant_id)
    if (!v) continue
    const title = v.product?.title ?? "Your item"
    const option = v.title && v.title !== "Default" && v.title !== "Default variant" ? v.title : null
    const m = buildMail(mail, {
      product: option ? `${title} (${option})` : title,
      link: v.product?.handle ? `/products/${v.product.handle}` : "/shop",
      items: [{ title, subtitle: option, image: v.product?.thumbnail, href: v.product?.handle ? `/products/${v.product.handle}` : null }],
    })
    if (await sendEmail(ctx.c, w.email, "auto-back_in_stock", m)) done.push(w.id)
  }
  if (done.length) await markStockAlertsSentWorkflow(ctx.c).run({ input: done })
  return done.length
}

export const runAutomations = async (c: MedusaContainer) => {
  const ctx = await loadCtx(c)
  const logger = c.resolve(ContainerRegistrationKeys.LOGGER)
  const out: Record<string, number> = {}
  for (const [name, fn] of [
    ["welcome", welcome],
    ["abandoned_cart", abandonedCarts],
    ["review_request", reviewRequests],
    ["win_back", winBack],
    ["back_in_stock", backInStock],
  ] as const) {
    try {
      out[name] = await fn(ctx)
    } catch (e) {
      logger.warn(`Automatic emails (${name}): ${(e as Error).message}`)
    }
  }
  return out
}

// A friend placed an order with an invite code: count it and reward the inviter.
export const handleReferralOrder = async (c: MedusaContainer, orderId: string) => {
  const features = (await loadSiteFeatures(c)).referrals
  if (!features.enabled) return
  const { data } = await q(c).graph({ entity: "order", fields: [...ORDER_FIELDS, "promotions.code"], filters: { id: orderId } })
  const order = data[0] as OrderRow | undefined
  const codes = (order?.promotions ?? []).map((p) => p.code).filter((x): x is string => !!x)
  if (!order || !codes.length) return
  const [ref] = await auto(c).listReferrals({ code: codes })
  if (!ref || ref.customer_id === order.customer_id) return
  if (await alreadySent(c, "referral_order", order.id)) return
  // A reward is for a new customer's first order over the minimum.
  const { data: earlier } = await q(c).graph({ entity: "order", fields: ["id"], filters: { email: order.email, created_at: { $lt: new Date(order.created_at) } }, pagination: { take: 1 } })
  const due = !earlier.length && Number(order.item_total ?? 0) >= features.min_order && features.get_amount > 0
  const { data: people } = await q(c).graph({ entity: "customer", fields: ["id", "email", "first_name"], filters: { id: ref.customer_id } })
  const inviter = people[0] as { email?: string | null; first_name?: string | null } | undefined
  await logAutomaticEmailWorkflow(c).run({ input: { kind: "referral_order", key: order.id, email: inviter?.email ?? "" } })
  if (!due) {
    await countReferralWorkflow(c).run({ input: ref.id })
    return
  }
  const { result } = await rewardReferralWorkflow(c).run({ input: { referral_id: ref.id, order_id: order.id, get_amount: features.get_amount, currency_code: order.currency_code ?? "inr" } })
  const auto2 = await loadAutomations(c)
  if (inviter?.email && auto2.referral_reward.enabled) {
    await sendEmail(c, inviter.email, "auto-referral_reward", buildMail(auto2.referral_reward, { name: inviter.first_name, code: result.code, link: "/shop" }))
  }
}

// A sample of one automatic email, sent to the admin from the settings page.
export const sampleMail = (kind: keyof Automations, mail: Mail, to: string) => {
  const items: MailItem[] = [{ title: "Walnut Folding Chess Board", subtitle: "Sheesham Wood", image: "/images/home-travel-case.jpg", href: "/shop" }]
  const opts: Parameters<typeof buildMail>[1] = { name: "Ravi", link: "/shop", marketing: kind === "welcome" || kind === "win_back" || kind === "abandoned_cart" ? { email: to } : undefined }
  if (kind === "abandoned_cart" || kind === "back_in_stock" || kind === "review_request") opts.items = items
  if (kind === "back_in_stock" || kind === "review_request") opts.product = "Walnut Folding Chess Board"
  if (kind === "referral_reward") opts.code = "THANKS-SAMPLE"
  const m = buildMail(mail, opts)
  return { ...m, subject: `[Sample] ${m.subject}` }
}

