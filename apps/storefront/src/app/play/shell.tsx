import { Suspense } from "react"

// Play pages use the full width with little padding, so the board can be as big as the screen allows.
export function PlayShell({ children, fallback = "Loading…" }: { children: React.ReactNode; fallback?: string }) {
  return (
    <section className="mx-auto max-w-[1320px] px-3 pb-10 pt-3 sm:px-6 lg:pb-14 lg:pt-5">
      <Suspense fallback={<p className="py-16 text-center text-muted">{fallback}</p>}>{children}</Suspense>
    </section>
  )
}
