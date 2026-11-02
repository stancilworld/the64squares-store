import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ipOf } from "../../../../lib/activity"
import { allowedChat, loadChatbot, logTurn } from "../../../../lib/chatbot"
import { loadOrders, orderView } from "../../../../lib/order-view"

const STEP: Record<string, string> = {
  placed: "Order placed. We're getting it ready.",
  packed: "Packed and waiting for the courier.",
  shipped: "On its way to you!",
  delivered: "Delivered.",
  canceled: "This order was cancelled.",
}
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10)

// POST /store/chatbot/track { session, order: "1042", contact: email or phone }
// The order's progress, when the email or phone matches the order (so nobody can look up
// someone else's order by guessing numbers).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { session?: unknown; order?: unknown; contact?: unknown }
  const bot = await loadChatbot(req.scope)
  if (!bot.enabled) return res.status(404).json({ message: "The chat isn't available right now." })
  const ip = ipOf(req) ?? "unknown"
  if (!allowedChat(`track:${ip}`, 8, 15 * 60_000)) {
    return res.status(429).json({ message: "Too many tries. Please wait a few minutes, or ask our team." })
  }
  const number = Number(String(body.order ?? "").replace(/\D/g, ""))
  const contact = String(body.contact ?? "").trim().toLowerCase()
  if (!number || !contact) return res.status(400).json({ message: "Please enter your order number and your email or phone number." })
  const [order] = await loadOrders(req.scope, { display_id: number })
  const phoneOk = digits(contact).length === 10 && [order?.shipping_address?.phone, order?.metadata?.phone].some((p) => digits(p) === digits(contact))
  const emailOk = !!order?.email && order.email.toLowerCase() === contact
  const session = typeof body.session === "string" && /^[\w-]{8,64}$/.test(body.session) ? body.session : null
  if (!order || !(phoneOk || emailOk)) {
    if (session) void logTurn(req.scope, session, [{ role: "bot", text: `Order #${number}: not found or details didn't match`, source: "track" }]).catch(() => {})
    return res.status(404).json({ message: "I couldn't find an order with those details. Check the order number (it's in your confirmation email) and use the same email or phone you ordered with." })
  }
  const v = orderView(order)
  if (session) void logTurn(req.scope, session, [{ role: "bot", text: `Order #${v.display_id}: ${v.step}`, source: "track" }]).catch(() => {})
  res.json({
    order: {
      display_id: v.display_id,
      created_at: v.created_at,
      step: v.step,
      step_text: STEP[v.step] ?? v.step,
      items: v.items.map((i) => ({ title: i.title, quantity: i.quantity })),
      tracking: v.tracking,
      url: `/order/${v.id}`,
    },
  })
}
