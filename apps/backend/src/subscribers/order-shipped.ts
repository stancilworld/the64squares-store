import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { orderShippedEmail, sendEmail } from "../lib/emails"
import { loadOrders, orderView } from "../lib/order-view"

// Marked as shipped in the admin: "it's on its way" email with the tracking number.
export default async function orderShipped({
  event,
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (event.data.no_notification) {
    return
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order_fulfillment",
    fields: ["order_id"],
    filters: { fulfillment_id: event.data.id },
  })
  const orderId = (data[0] as { order_id?: string } | undefined)?.order_id
  if (!orderId) {
    return
  }
  const [row] = await loadOrders(container, { id: orderId })
  if (!row?.email) {
    return
  }
  const order = orderView(row)
  await sendEmail(container, order.email, "order-shipped", orderShippedEmail(order, order.tracking))
}

export const config: SubscriberConfig = { event: "shipment.created" }
