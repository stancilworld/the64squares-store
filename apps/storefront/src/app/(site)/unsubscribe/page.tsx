import type { Metadata } from "next"
import { Suspense } from "react"
import { Unsubscribe } from "./unsubscribe"

export const metadata: Metadata = { title: "Stop emails", robots: { index: false } }

// Opened from "Stop these emails" in an email. Asks before stopping (mail scanners open links).
export default function UnsubscribePage() {
  return (
    <section className="mx-auto max-w-[560px] px-6 py-20 lg:py-28">
      <Suspense fallback={null}>
        <Unsubscribe />
      </Suspense>
    </section>
  )
}
