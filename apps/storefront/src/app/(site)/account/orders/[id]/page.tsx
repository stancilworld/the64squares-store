import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeftLong } from "@/components/icons"
import { OrderDetails, orderDate } from "@/components/order-details"
import { getCustomer, getMyOrder } from "@/lib/auth"

export const metadata: Metadata = { title: "Order", robots: { index: false } }

async function AccountOrder({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params
  if (!(await getCustomer())) {
    redirect(`/account?next=/account/orders/${id}`)
  }
  const order = await getMyOrder(id)
  if (!order) {
    notFound()
  }
  return (
    <>
      <Link href="/account" className="inline-flex items-center gap-[3px] text-[12px] hover:underline lg:text-[15px]">
        <ArrowLeftLong className="h-[10px] w-[30px] lg:w-[40px]" />
        Your account
      </Link>
      <h1 className="mt-6 text-[26px] font-semibold lg:text-[34px]">Order #{order.display_id}</h1>
      <p className="mt-1 text-[15px] text-black/70 lg:text-[17px]">Placed on {orderDate(order.created_at)}</p>
      <div className="mt-10">
        <OrderDetails order={order} />
      </div>
    </>
  )
}

export default function Page(props: PageProps<"/account/orders/[id]">) {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-6 lg:px-[128px] lg:pt-[40px]">
      <Suspense fallback={<p className="text-center text-[18px] text-black/60">Loading…</p>}>
        <AccountOrder {...props} />
      </Suspense>
    </section>
  )
}
