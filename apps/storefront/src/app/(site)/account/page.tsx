import type { Metadata } from "next"
import { Suspense } from "react"
import { AccountHome } from "@/components/account/account-home"
import { SignIn } from "@/components/account/sign-in"
import { getCustomer, getMyInvite, getMyOrders } from "@/lib/auth"
import { getCheckoutConfig } from "@/lib/checkout"
import { getMyTickets } from "@/lib/tournament-actions"

export const metadata: Metadata = { title: "Account", robots: { index: false } }

async function Account({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams
  const next = typeof sp.next === "string" ? sp.next : undefined
  const customer = await getCustomer()
  if (!customer) {
    const config = await getCheckoutConfig()
    return <SignIn google={config.google} next={next} />
  }
  const [orders, tickets, invite] = await Promise.all([getMyOrders(), getMyTickets(), getMyInvite()])
  return <AccountHome customer={customer} orders={orders} tickets={tickets} invite={invite} />
}

export default function AccountPage(props: PageProps<"/account">) {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-10 lg:px-[128px] lg:pt-[60px]">
      <Suspense fallback={<p className="text-center text-[18px] text-black/60">Loading…</p>}>
        <Account {...props} />
      </Suspense>
    </section>
  )
}
