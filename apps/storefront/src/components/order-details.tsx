import Link from "next/link"
import type { AccountOrder } from "@/lib/auth"
import { formatPrice } from "@/lib/format"
import { FillMedia } from "./media"

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const

export const orderDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })

export const stepLabel = (step: AccountOrder["step"]) =>
  step === "canceled" ? "Cancelled" : STEPS.find((s) => s.key === step)?.label ?? "Order placed"

// Order number, progress, items, address and totals (order page and account pages).
export function OrderDetails({ order }: { order: AccountOrder }) {
  const at = STEPS.findIndex((s) => s.key === order.step)
  const a = order.shipping_address
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-[96px]">
      <div>
        {order.step === "canceled" ? (
          <p className="rounded-md bg-pill p-5 text-[15px] lg:text-[17px]">This order was cancelled.</p>
        ) : (
          <ol className="flex items-start justify-between gap-2" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex flex-1 flex-col items-center text-center" aria-current={i === at ? "step" : undefined}>
                <span className="flex w-full items-center">
                  <span className={`h-[2px] flex-1 ${i === 0 ? "opacity-0" : i <= at ? "bg-black" : "bg-black/20"}`} />
                  <span className={`h-[14px] w-[14px] shrink-0 rounded-full border-[2px] ${i <= at ? "border-black bg-black" : "border-black/30 bg-white"}`} />
                  <span className={`h-[2px] flex-1 ${i === STEPS.length - 1 ? "opacity-0" : i < at ? "bg-black" : "bg-black/20"}`} />
                </span>
                <span className={`mt-2 text-[12px] lg:text-[15px] ${i <= at ? "text-black" : "text-black/40"}`}>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
        {order.tracking.length > 0 && (
          <div className="mt-6 text-[14px] lg:text-[16px]">
            {order.tracking.map((t, i) => (
              <p key={i}>
                Tracking: <strong>{t.number}</strong>{" "}
                {t.url && (
                  <a href={t.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    Track parcel
                  </a>
                )}
              </p>
            ))}
          </div>
        )}
        <ul className="mt-8 space-y-6">
          {order.items.map((i) => (
            <li key={i.id} className="flex gap-4 border-b border-black/25 pb-6">
              <div className="min-w-0 flex-1">
                {i.handle ? (
                  <Link href={`/products/${i.handle}`} className="text-[18px] font-medium leading-tight lg:text-[24px]">
                    {i.title}
                  </Link>
                ) : (
                  <p className="text-[18px] font-medium lg:text-[24px]">{i.title}</p>
                )}
                {i.variant_title && i.variant_title !== "Default" && (
                  <p className="mt-[2px] text-[13px] text-black/60 lg:text-[15px]">{i.variant_title}</p>
                )}
                <p className="mt-[2px] text-[12px] italic lg:text-[14px]">Quantity: {i.quantity}</p>
                <p className="mt-2 text-[15px] lg:text-[17px]">{formatPrice(i.total)}</p>
              </div>
              <span className="relative h-[82px] w-[92px] shrink-0 overflow-hidden rounded-md bg-placeholder lg:h-[110px] lg:w-[124px] lg:rounded-md">
                {i.thumbnail && <FillMedia src={i.thumbnail} sizes="124px" alt="" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <aside className="mt-10 h-fit space-y-8 lg:mt-0">
        <div>
          <h2 className="px-1 text-[18px] font-semibold lg:text-[22px]">Delivering to</h2>
          <p className="mt-3 px-1 text-[14px] leading-[22px] lg:text-[16px] lg:leading-[26px]">
            {[a?.first_name, a?.last_name].filter(Boolean).join(" ")}
            <br />
            {[a?.address_1, a?.address_2].filter(Boolean).join(", ")}
            <br />
            {[a?.city, a?.province, a?.postal_code].filter(Boolean).join(", ")}
            {a?.phone && (
              <>
                <br />
                {a.phone}
              </>
            )}
          </p>
        </div>
        <div>
          <h2 className="px-1 text-[18px] font-semibold lg:text-[22px]">Payment</h2>
          <p className="mt-3 px-1 text-[14px] lg:text-[16px]">
            {order.payment_method === "Cash on Delivery"
              ? order.paid
                ? "Cash on Delivery (paid)"
                : `Cash on Delivery: please keep ${formatPrice(order.total)} ready`
              : "Paid online"}
          </p>
          <dl className="mt-5 space-y-[14px] px-1 text-[13px] lg:text-[16px]">
            <div className="flex justify-between"><dt>Items</dt><dd>{formatPrice(order.item_total)}</dd></div>
            {order.discount_total > 0 && (
              <div className="flex justify-between"><dt>Discount</dt><dd>− {formatPrice(order.discount_total)}</dd></div>
            )}
            <div className="flex justify-between"><dt>GST/Tax (included)</dt><dd>{formatPrice(order.tax_total)}</dd></div>
            <div className="flex justify-between"><dt>Shipping fee</dt><dd>{order.shipping_total ? formatPrice(order.shipping_total) : "Free"}</dd></div>
          </dl>
          <div className="mt-5 flex justify-between border-t border-black px-1 pt-5 text-[14px] font-semibold lg:text-[18px]">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
          {order.invoice_url && (
            <a
              href={order.invoice_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex h-[42px] items-center justify-center rounded-full border border-black text-[15px] hover:bg-linen"
            >
              Download GST invoice
            </a>
          )}
        </div>
        <p className="text-center text-[13px] italic underline underline-offset-2 lg:text-[15px]">
          <Link href="/contact">Need help? Contact us</Link>
        </p>
      </aside>
    </div>
  )
}
