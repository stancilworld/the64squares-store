import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// What a shopper sees about an order (account pages, confirmation page, emails).

export const ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "status",
  "email",
  "customer_id",
  "metadata",
  "currency_code",
  "total",
  "item_total",
  "shipping_total",
  "tax_total",
  "discount_total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.product_handle",
  "items.thumbnail",
  "items.quantity",
  "items.total",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.postal_code",
  "shipping_address.phone",
  "fulfillments.id",
  "fulfillments.created_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.provider_id",
]

type Row = Record<string, any>

export const paymentMethodOf = (o: Row) => {
  const sessions = (o.payment_collections ?? []).flatMap((c: Row) => c?.payment_sessions ?? [])
  const payments = (o.payment_collections ?? []).flatMap((c: Row) => c?.payments ?? [])
  const provider = payments[0]?.provider_id ?? sessions.find((s: Row) => s?.status === "authorized")?.provider_id ?? sessions[0]?.provider_id
  return provider === "pp_razorpay_razorpay" ? "Paid online" : "Cash on Delivery"
}

export const orderView = (o: Row) => {
  const live = (o.fulfillments ?? []).filter((f: Row) => f && !f.canceled_at)
  const step =
    o.status === "canceled"
      ? "canceled"
      : live.some((f: Row) => f.delivered_at)
        ? "delivered"
        : live.some((f: Row) => f.shipped_at)
          ? "shipped"
          : live.length
            ? "packed"
            : "placed"
  const payments = (o.payment_collections ?? []).flatMap((c: Row) => c?.payments ?? [])
  return {
    id: o.id,
    display_id: o.display_id,
    created_at: o.created_at,
    email: o.email,
    currency_code: o.currency_code,
    total: Number(o.total ?? 0),
    item_total: Number(o.item_total ?? 0),
    shipping_total: Number(o.shipping_total ?? 0),
    tax_total: Number(o.tax_total ?? 0),
    discount_total: Number(o.discount_total ?? 0),
    step,
    payment_method: paymentMethodOf(o),
    paid: payments.some((p: Row) => p?.captured_at),
    items: (o.items ?? []).map((i: Row) => ({
      id: i.id,
      title: i.product_title ?? i.title,
      variant_title: i.variant_title,
      handle: i.product_handle,
      thumbnail: i.thumbnail,
      quantity: Number(i.quantity),
      total: Number(i.total ?? 0),
    })),
    shipping_address: o.shipping_address ?? null,
    // GST invoice (lib/invoices.ts), once the order has one.
    invoice_number: (o.metadata?.invoice?.number as string | undefined) ?? null,
    invoice_url: o.metadata?.invoice?.number
      ? `${(process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")}/invoice/${o.id}`
      : null,
    tracking: live
      .flatMap((f: Row) => f.labels ?? [])
      .filter((l: Row) => l?.tracking_number || l?.tracking_url)
      .map((l: Row) => ({ number: l.tracking_number, url: l.tracking_url })),
  }
}

export const loadOrders = async (container: MedusaContainer, filters: Record<string, unknown>) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters })
  return (data as Row[])
    .filter((o) => o.status !== "draft")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
