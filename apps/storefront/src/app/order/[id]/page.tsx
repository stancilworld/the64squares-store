import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { OrderDetails, orderDate } from "@/components/order-details"
import { getCustomer, getOrderStatus } from "@/lib/auth"

export const metadata: Metadata = { title: "Your order", robots: { index: false } }

async function OrderPage({ params, searchParams }: PageProps<"/order/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const [order, customer] = await Promise.all([getOrderStatus(id), getCustomer()])
  if (!order) {
    notFound()
  }
  const fresh = sp.new === "1"
  return (
    <>
      <div className="mx-auto max-w-[760px] text-center">
        <h1 className="font-display text-[48px] leading-none lg:text-[88px]">{fresh ? "Thank you!" : "Your order"}</h1>
        <p className="mt-4 text-[16px] lg:text-[20px]">
          Order <strong>#{order.display_id}</strong> · {orderDate(order.created_at)}
        </p>
        {fresh && (
          <p className="mt-2 text-[15px] text-black/70 lg:text-[18px]">
            We&apos;ve emailed the details to {order.email}. We&apos;ll email again when it ships.
          </p>
        )}
        {fresh && !customer && (
          <p className="mt-4 text-[14px] lg:text-[16px]">
            <Link href="/account" className="underline underline-offset-4">
              Sign in with {order.email}
            </Link>{" "}
            any time to see your orders.
          </p>
        )}
      </div>
      <div className="mt-12 lg:mt-16">
        <OrderDetails order={order} />
      </div>
      <div className="mt-12 text-center">
        <Link href="/shop" className="inline-flex h-[42px] items-center rounded-full bg-ink px-8 text-[16px] text-white">
          Continue shopping
        </Link>
      </div>
    </>
  )
}

export default function Page(props: PageProps<"/order/[id]">) {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-10 lg:px-[128px] lg:pt-[60px]">
      <Suspense fallback={<p className="text-center text-[18px] text-black/60">Loading your order…</p>}>
        <OrderPage {...props} />
      </Suspense>
    </section>
  )
}
