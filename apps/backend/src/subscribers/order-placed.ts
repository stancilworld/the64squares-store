import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { loadCheckoutSettings } from "../lib/checkout-settings"
import { newOrderForStoreEmail, orderPlacedEmail, sendEmail } from "../lib/emails"
import { ensureInvoice } from "../lib/invoices"
import { loadOrders, orderView } from "../lib/order-view"

// New order: give it its GST invoice number (Settings → Invoices), then the confirmation
// email to the shopper (with the invoice link) and an alert to the store.
export default async function orderPlaced({ event, container }: SubscriberArgs<{ id: string }>) {
  const [row] = await loadOrders(container, { id: event.data.id })
  if (!row) {
    return
  }
  const order = orderView(row)
  const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const invoice = await ensureInvoice(container, order.id).catch(() => null)
  if (order.email) {
    await sendEmail(container, order.email, "order-placed", orderPlacedEmail(order, invoice ? `${backend}/invoice/${order.id}` : null))
  }
  const settings = await loadCheckoutSettings(container)
  if (settings.order_alert_email) {
    await sendEmail(container, settings.order_alert_email, "order-alert", newOrderForStoreEmail(order, backend))
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
