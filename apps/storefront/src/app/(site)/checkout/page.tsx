import type { Metadata } from "next"
import { Suspense } from "react"
import { Checkout } from "@/components/checkout/checkout"
import { getCustomer } from "@/lib/auth"
import { getCheckoutConfig } from "@/lib/checkout"

export const metadata: Metadata = { title: "Checkout", robots: { index: false } }

async function CheckoutLoader() {
  const [config, customer] = await Promise.all([getCheckoutConfig(), getCustomer()])
  return <Checkout config={config} customer={customer} />
}

// Backpack → Addresses → Payment. Only the items ticked in the backpack are bought.
export default function CheckoutPage() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-6 lg:px-[128px] lg:pt-[40px]">
      <Suspense fallback={<p className="mt-16 text-center text-[18px] text-black/60">Getting your order ready…</p>}>
        <CheckoutLoader />
      </Suspense>
    </section>
  )
}
