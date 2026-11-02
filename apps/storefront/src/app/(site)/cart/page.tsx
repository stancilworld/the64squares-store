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

export default function BackpackPage() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[96px] pt-6 lg:px-[128px] lg:pb-[140px] lg:pt-[40px]">
      <CheckoutSteps current="Cart" />
      <div className="mt-10 lg:mt-14">
        <Suspense fallback={<div className="h-[400px]" />}>
          <BackpackLoader />
        </Suspense>
      </div>
    </section>
  )
}
