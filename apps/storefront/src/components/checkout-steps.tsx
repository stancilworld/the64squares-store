import Link from "next/link"
import { ArrowLeftLong } from "./icons"

const STEPS = ["Cart", "Addresses", "Payment"] as const

// "Cart ——→ Addresses ——→ Payment", with the current step in black.
export function CheckoutSteps({ current }: { current: (typeof STEPS)[number] }) {
  const at = STEPS.indexOf(current)
  return (
    <>
      <Link href="/shop" className="inline-flex items-center gap-[3px] text-[12px] hover:underline lg:text-[15px]">
        <ArrowLeftLong className="h-[10px] w-[30px] lg:w-[40px]" />
        Back to shop
      </Link>
      <ol className="mx-auto mt-6 flex max-w-[620px] items-center justify-center gap-2 text-[15px] lg:mt-8 lg:gap-4 lg:text-[20px]">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 lg:gap-4 ${i <= at ? "text-black" : "text-black/35"}`} aria-current={i === at ? "step" : undefined}>
            {i > 0 && (
              <svg className="h-[10px] w-[44px] lg:w-[72px]" viewBox="0 0 72 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <path d="M0 5h70m0 0l-4-4m4 4l-4 4" />
              </svg>
            )}
            {s}
          </li>
        ))}
      </ol>
    </>
  )
}
