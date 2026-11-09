"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { type AccountOrder, deleteAddress, setPassword, signOut, updateDetails } from "@/lib/auth"
import { notifyCartChanged } from "@/lib/cart-events"
import { formatPrice } from "@/lib/format"
import { eventDay, eventTime, type Ticket } from "@/lib/tournament-types"
import { Field, PrimaryButton } from "../checkout/fields"
import { FillMedia } from "../media"
import { orderDate, stepLabel } from "../order-details"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-8">
      <h2 className="font-display h-sub">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Details({ customer }: { customer: HttpTypes.StoreCustomer }) {
  const router = useRouter()
  const [first, setFirst] = useState(customer.first_name ?? "")
  const [last, setLast] = useState(customer.last_name ?? "")
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="grid max-w-[640px] grid-cols-1 gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await updateDetails({ first_name: first, last_name: last, phone })
          setMsg(res.ok ? "Saved." : res.error)
          router.refresh()
        })
      }}
    >
      <Field label="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
      <Field label="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
      <Field label="Mobile number" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
      <Field label="Email" value={customer.email} disabled hint="Your sign-in email." />
      <div className="flex items-center gap-4 sm:col-span-2">
        <PrimaryButton type="submit" disabled={pending} className="max-w-[220px]">
          {pending ? "Saving…" : "Save"}
        </PrimaryButton>
        {msg && <span className="text-[14px]">{msg}</span>}
      </div>
    </form>
  )
}

function Password() {
  const [value, setValue] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="flex max-w-[640px] flex-col gap-4 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await setPassword(value)
          setMsg(res.ok ? "Password saved. You can now sign in with it." : res.error)
          if (res.ok) setValue("")
        })
      }}
    >
      <Field
        className="flex-1"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hint={msg ?? "At least 8 characters. You can always sign in with an email code too."}
      />
      <PrimaryButton type="submit" disabled={pending || value.length < 8} className="sm:mt-[26px] sm:max-w-[220px]">
        {pending ? "Saving…" : "Set password"}
      </PrimaryButton>
    </form>
  )
}

export function AccountHome({ customer, orders, tickets = [] }: { customer: HttpTypes.StoreCustomer; orders: AccountOrder[]; tickets?: Ticket[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const addresses = customer.addresses ?? []
  return (
    <div className={`space-y-12 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display h-page">Hi{customer.first_name ? `, ${customer.first_name}` : ""}!</h1>
          <p className="mt-1 text-[15px] text-black/70 lg:text-[17px]">{customer.email}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await signOut()
              notifyCartChanged()
              router.push("/")
              router.refresh()
            })
          }
          className="h-[40px] rounded-md border border-black px-6 text-[15px] hover:bg-chalk"
        >
          Sign out
        </button>
      </div>

      <Section title="Your orders">
        {orders.length ? (
          <ul className="space-y-4">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/account/orders/${o.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-md border border-black/20 p-4 hover:border-black lg:p-5"
                >
                  <span className="flex -space-x-3">
                    {o.items.slice(0, 3).map((i) => (
                      <span key={i.id} className="relative h-[56px] w-[56px] overflow-hidden rounded-md border-2 border-white bg-placeholder">
                        {i.thumbnail && <FillMedia src={i.thumbnail} sizes="56px" alt="" />}
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-medium lg:text-[18px]">
                      Order #{o.display_id}
                    </span>
                    <span className="block text-[13px] text-black/60 lg:text-[15px]">
                      {orderDate(o.created_at)} · {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[15px] font-medium lg:text-[17px]">{formatPrice(o.total)}</span>
                    <span className={`block text-[13px] lg:text-[15px] ${o.step === "canceled" ? "text-red-700" : "text-black/60"}`}>
                      {stepLabel(o.step)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="text-[16px]">No orders yet.</p>
            <Link href="/shop" className="mt-4 btn btn-solid">
              Browse the shop
            </Link>
          </div>
        )}
      </Section>

      {tickets.length > 0 && (
        <Section title="Your tournaments">
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/account/tickets/${t.ticket_code}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/20 p-4 hover:border-black lg:p-5"
                >
                  <span className="min-w-0">
                    <span className="block text-[16px] font-medium">{t.tournament.title}</span>
                    <span className="block text-[13px] text-muted">
                      {eventDay(t.tournament.starts_at)}, {eventTime(t.tournament.starts_at)}
                    </span>
                  </span>
                  <span className="text-right text-[13px]">
                    <span className="block font-mono font-medium">{t.ticket_code}</span>
                    <span className={t.status === "cancelled" ? "text-love" : "text-muted"}>
                      {t.status === "cancelled" ? "Cancelled" : t.checked_in_at ? "Checked in" : "Show ticket"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your details">
        <Details customer={customer} />
      </Section>

      <Section title="Saved addresses">
        {addresses.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {addresses.map((a) => (
              <li key={a.id} className="rounded-md bg-pill p-5 text-[14px] leading-[22px] lg:text-[16px] lg:leading-[26px]">
                <p className="font-medium">{[a.first_name, a.last_name].filter(Boolean).join(" ")}</p>
                <p>{[a.address_1, a.address_2].filter(Boolean).join(", ")}</p>
                <p>{[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</p>
                {a.phone && <p>{a.phone}</p>}
                <button
                  type="button"
                  className="mt-2 text-[13px] italic underline underline-offset-2 lg:text-[14px]"
                  onClick={() =>
                    start(async () => {
                      await deleteAddress(a.id)
                      router.refresh()
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-black/70">Addresses you use at checkout are saved here.</p>
        )}
      </Section>

      <Section title="Password">
        <Password />
      </Section>
    </div>
  )
}
