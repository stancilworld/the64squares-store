import type { Metadata } from "next"
import { Suspense } from "react"
import { GoogleReturn } from "@/components/account/google-return"

export const metadata: Metadata = { title: "Signing in", robots: { index: false } }

// Google sends shoppers back here after they choose their account.
export default function GooglePage() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-16 text-center lg:px-[128px]">
      <Suspense fallback={<p className="text-[18px] text-black/60">Signing you in…</p>}>
        <GoogleReturn />
      </Suspense>
    </section>
  )
}
