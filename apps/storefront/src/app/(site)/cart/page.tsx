import type { Metadata } from "next"
import { Suspense } from "react"
import { Backpack } from "@/components/backpack"
import { CheckoutSteps } from "@/components/checkout-steps"
import { getCart } from "@/lib/cart"

export const metadata: Metadata = { title: "Cart" }

async function BackpackLoader() {
  const cart = await getCart()
  return <Backpack cart={cart} />
}

async function Restored({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  if (sp.restored !== "1") return null
  return (
    <p role="status" className="mt-6 border-l-4 border-amber bg-chalk px-4 py-3 text-[15px]">
      Welcome back. We&apos;ve put the items from your last visit in your cart.
    </p>
  )
}

export default function BackpackPage(props: PageProps<"/cart">) {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[96px] pt-6 lg:px-[128px] lg:pb-[140px] lg:pt-[40px]">
      <CheckoutSteps current="Cart" />
      <Suspense fallback={null}>
        <Restored searchParams={props.searchParams} />
      </Suspense>
      <div className="mt-10 lg:mt-14">
        <Suspense fallback={<div className="h-[400px]" />}>
          <BackpackLoader />
        </Suspense>
      </div>
    </section>
  )
}
