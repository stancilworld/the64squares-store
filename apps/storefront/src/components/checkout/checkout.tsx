"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { notifyCartChanged } from "@/lib/cart-events"
import {
  type Address,
  type CheckoutConfig,
  type PincodeInfo,
  checkPincode,
  placeOrder,
  prepareCheckout,
  saveAddress,
  startPayment,
} from "@/lib/checkout"
import { formatPrice } from "@/lib/format"
import { CheckoutSteps } from "../checkout-steps"
import { FillMedia } from "../media"
import { Field, PrimaryButton, STATES, SelectField, matchState } from "./fields"
import { track } from "@/lib/tracking/engine"
import { cartItems } from "@/lib/tracking/items"

type Cart = HttpTypes.StoreCart
type Customer = HttpTypes.StoreCustomer | null

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void }
  }
}

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement("script")
    s.src = "https://checkout.razorpay.com/v1/checkout.js"
    s.onload = () => resolve(!!window.Razorpay)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })

const EMPTY: Address = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  address_1: "",
  address_2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  save: true,
}

const fromCustomer = (c: Customer, cart: Cart | null): Address => {
  const ship = cart?.shipping_address
  const saved = c?.addresses?.find((a) => a.is_default_shipping) ?? c?.addresses?.[0]
  const a = ship?.address_1 ? ship : saved
  return {
    ...EMPTY,
    email: cart?.email || c?.email || "",
    first_name: a?.first_name || c?.first_name || "",
    last_name: a?.last_name || c?.last_name || "",
    phone: (a?.phone || c?.phone || "").replace(/\D/g, "").slice(-10),
    address_1: a?.address_1 || "",
    address_2: a?.address_2 || "",
    city: a?.city || "",
    state: matchState(a?.province) || a?.province || "",
    pincode: a?.postal_code || "",
  }
}

type Errors = Partial<Record<keyof Address, string>>

const validate = (a: Address, pin: PincodeInfo | null): Errors => {
  const e: Errors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email.trim())) e.email = "Please enter a valid email."
  if (!a.first_name.trim()) e.first_name = "Please enter your first name."
  if (!/^[6-9]\d{9}$/.test(a.phone.replace(/\D/g, "").slice(-10))) e.phone = "Please enter a 10-digit mobile number."
  if (!/^[1-9]\d{5}$/.test(a.pincode.trim())) e.pincode = "Please enter a 6-digit pincode."
  else if (pin && pin.pincode === a.pincode.trim() && !pin.valid) e.pincode = "This pincode doesn't exist. Please check it."
  else if (pin && pin.pincode === a.pincode.trim() && !pin.deliverable) e.pincode = "Sorry, we don't deliver to this pincode yet."
  if (a.address_1.trim().length < 3) e.address_1 = "Please enter your house number and building."
  if (!a.city.trim()) e.city = "Please enter your city."
  if (!a.state) e.state = "Please choose your state."
  return e
}

function Summary({ cart, config, children }: { cart: Cart; config: CheckoutConfig; children?: React.ReactNode }) {
  const items = [...(cart.items ?? [])]
  const count = items.reduce((n, i) => n + i.quantity, 0)
  const total = cart.total ?? 0
  const mrp = items.reduce((n, l) => n + (l.compare_at_unit_price ?? l.unit_price) * l.quantity, 0)
  const itemTotal = cart.item_total ?? 0
  const discount = Math.max(0, mrp - itemTotal) + (cart.discount_total ?? 0)
  return (
    <aside className="mt-[56px] h-fit lg:sticky lg:top-[150px] lg:mt-0" aria-labelledby="order-summary">
      <h2 id="order-summary" className="px-1 text-[18px] font-semibold lg:text-[22px]">
        Your order <span className="text-[13px] font-normal lg:text-[15px]">({count} {count === 1 ? "item" : "items"})</span>
      </h2>
      <ul className="mt-5 space-y-4 px-1">
        {items.map((l) => (
          <li key={l.id} className="flex items-center gap-3">
            <span className="relative h-[56px] w-[64px] shrink-0 overflow-hidden rounded-md bg-placeholder">
              {l.thumbnail && <FillMedia src={l.thumbnail} sizes="64px" alt="" />}
            </span>
            <span className="min-w-0 flex-1 text-[13px] lg:text-[15px]">
              <span className="block truncate font-medium">{l.product_title}</span>
              <span className="block text-black/60">
                {l.variant_title && l.variant_title !== "Default" ? `${l.variant_title} · ` : ""}Qty {l.quantity}
              </span>
              {typeof l.metadata?.engraving === "string" && l.metadata.engraving && (
                <span className="block truncate text-black/60">“{l.metadata.engraving}”</span>
              )}
            </span>
            <span className="text-[13px] lg:text-[15px]">{formatPrice(l.total ?? l.unit_price * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-6 space-y-[14px] border-t border-black/25 px-1 pt-5 text-[13px] lg:text-[16px]">
        <div className="flex justify-between"><dt>Total MRP</dt><dd>{formatPrice(mrp)}</dd></div>
        <div className="flex justify-between"><dt>Discount</dt><dd>{discount > 0 ? `− ${formatPrice(discount)}` : formatPrice(0)}</dd></div>
        <div className="flex justify-between"><dt>GST/Tax (included)</dt><dd>{formatPrice(cart.tax_total ?? 0)}</dd></div>
        <div className="flex justify-between"><dt>Shipping fee</dt><dd>{cart.shipping_total ? formatPrice(cart.shipping_total) : "Free"}</dd></div>
      </dl>
      <div className="mt-5 flex justify-between border-t border-black px-1 pt-5 text-[14px] font-semibold lg:text-[18px]">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
      {config.delivery_text && <p className="mt-3 px-1 text-[13px] text-black/60 lg:text-[14px]">{config.delivery_text}</p>}
      {children}
      <p className="mt-6 text-center text-[13px] italic underline underline-offset-2 lg:text-[15px]">
        <Link href="/contact">Need help? Contact us</Link>
      </p>
    </aside>
  )
}

function PayOption({
  checked,
  onSelect,
  title,
  text,
  disabled,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  text: string
  disabled?: string | null
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-md border p-5 lg:p-6 ${
        checked ? "border-black" : "border-black/25"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="payment"
        className="sr-only"
        checked={checked}
        disabled={!!disabled}
        onChange={onSelect}
      />
      <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-black lg:h-[20px] lg:w-[20px]">
        {checked && <span className="h-[10px] w-[10px] rounded-full bg-black" />}
      </span>
      <span>
        <span className="block text-[17px] font-medium lg:text-[20px]">{title}</span>
        <span className="mt-1 block text-[13px] text-black/60 lg:text-[15px]">{disabled || text}</span>
      </span>
    </label>
  )
}

export function Checkout({ config, customer }: { config: CheckoutConfig; customer: Customer }) {
  const router = useRouter()
  const [phase, setPhase] = useState<"loading" | "empty" | "address" | "payment">("loading")
  const [cart, setCart] = useState<Cart | null>(null)
  const [form, setForm] = useState<Address>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [pin, setPin] = useState<PincodeInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setMethod] = useState<"online" | "cod" | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const lookUp = useCallback(async (pincode: string) => {
    const info = await checkPincode(pincode)
    if (!info) return
    setPin(info)
    if (info.valid) {
      setForm((f) => ({
        ...f,
        city: f.city || info.city || "",
        state: f.state || matchState(info.state) || "",
      }))
      setErrors((e) => ({ ...e, pincode: undefined }))
    }
  }, [])

  useEffect(() => {
    prepareCheckout().then(({ cart, empty }) => {
      if (empty || !cart) {
        setPhase("empty")
        return
      }
      const start = fromCustomer(customer, cart)
      setCart(cart)
      setForm(start)
      setPhase("address")
      track("InitiateCheckout", { value: cart.total ?? 0, currency: cart.currency_code, items: cartItems(cart), cart_id: cart.id })
      if (/^[1-9]\d{5}$/.test(start.pincode)) {
        lookUp(start.pincode)
      }
    })
  }, [customer, lookUp])


  const set = (key: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value
    const clean = key === "pincode" || key === "phone" ? String(value).replace(/\D/g, "").slice(0, key === "pincode" ? 6 : 10) : value
    setForm((f) => ({ ...f, [key]: clean }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
    if (key === "pincode" && /^[1-9]\d{5}$/.test(String(clean)) && pin?.pincode !== clean) {
      lookUp(String(clean))
    }
  }

  const total = cart?.total ?? 0
  const codBlocked = useMemo(() => {
    if (!config.cod) return "Not available right now."
    if (config.cod_max && total > config.cod_max) return `Available for orders up to ${formatPrice(config.cod_max)}.`
    if (pin && pin.pincode === form.pincode && !pin.cod) return "Not available for this pincode."
    return null
  }, [config.cod, config.cod_max, total, pin, form.pincode])
  const onlineBlocked = config.online ? null : "Not available right now."

  // Online payment is preselected when available; a blocked choice falls back to the other.
  const method =
    picked === "online" && !onlineBlocked
      ? "online"
      : picked === "cod" && !codBlocked
        ? "cod"
        : !onlineBlocked
          ? "online"
          : !codBlocked
            ? "cod"
            : null

  const scrollTop = () => top.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  const continueToPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const found = validate(form, pin)
    setErrors(found)
    if (Object.keys(found).length) {
      const first = document.querySelector<HTMLInputElement>("[aria-invalid=true]")
      first?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const res = await saveAddress(form)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCart(res.cart)
    setPhase("payment")
    track("AddPaymentInfo", { value: res.cart.total ?? 0, currency: res.cart.currency_code, items: cartItems(res.cart), cart_id: res.cart.id })
    scrollTop()
  }

  const finish = async () => {
    const res = await placeOrder()
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    notifyCartChanged()
    router.push(`/order/${res.orderId}?new=1`)
  }

  const pay = async () => {
    if (!method) return
    setBusy(true)
    setError(null)
    const started = await startPayment(method)
    if (!started.ok) {
      setBusy(false)
      setError(started.error)
      return
    }
    if (started.method === "cod") {
      await finish()
      return
    }
    if (!(await loadRazorpay()) || !window.Razorpay) {
      setBusy(false)
      setError("The payment window couldn't open. Please check your internet connection and try again.")
      return
    }
    const rzp = new window.Razorpay({
      key: started.key_id,
      order_id: started.razorpay_order_id,
      amount: started.amount,
      currency: started.currency,
      name: "The 64 Squares",
      description: "Premium chess sets & tournaments",
      image: `${window.location.origin}/brand/logo-header.png`,
      prefill: { name: `${form.first_name} ${form.last_name}`.trim(), email: form.email, contact: `+91${form.phone}` },
      notes: { pincode: form.pincode },
      theme: { color: "#111111" },
      handler: () => {
        finish()
      },
      modal: {
        ondismiss: () => {
          setBusy(false)
          setError("Payment was not completed. You can try again, or choose Cash on Delivery.")
        },
      },
    })
    rzp.on("payment.failed", () => {
      setError("The payment didn't go through. No money was taken. Please try again or use another method.")
    })
    rzp.open()
  }

  if (phase === "loading") {
    return (
      <div ref={top} className="scroll-mt-[90px] lg:scroll-mt-[150px]">
        <CheckoutSteps current="Addresses" />
        <p className="mt-16 text-center text-[18px] text-black/60">Getting your order ready…</p>
      </div>
    )
  }

  if (phase === "empty" || !cart) {
    return (
      <div ref={top} className="scroll-mt-[90px] lg:scroll-mt-[150px]">
        <CheckoutSteps current="Addresses" />
        <div className="mx-auto mt-16 max-w-[560px] text-center">
          <h1 className="text-[22px] font-semibold lg:text-[34px]">Nothing to check out yet</h1>
          <p className="mt-3 text-[16px] lg:text-[18px]">Tick the items you want in your cart, then press Checkout.</p>
          <Link href="/cart" className="mt-6 btn btn-solid">
            Go to your cart
          </Link>
        </div>
      </div>
    )
  }

  const a = cart.shipping_address

  return (
    <div ref={top} className="scroll-mt-[90px] lg:scroll-mt-[150px]">
      <CheckoutSteps current={phase === "address" ? "Addresses" : "Payment"} />
      <div className={`mt-10 lg:mt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-[96px] ${busy ? "opacity-80" : ""}`}>
        <div>
          {phase === "address" ? (
            <form onSubmit={continueToPayment} noValidate>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-[22px] font-semibold lg:text-[34px]">Delivery address</h1>
                {!customer && (
                  <Link href="/account?next=/checkout" className="text-[14px] underline underline-offset-4 lg:text-[16px]">
                    Have an account? Sign in
                  </Link>
                )}
              </div>
              <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 lg:mt-9">
                <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} hint="For your order confirmation." />
                <Field label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10 digits" value={form.phone} onChange={set("phone")} error={errors.phone} hint="For the delivery person." />
                <Field label="First name" autoComplete="given-name" value={form.first_name} onChange={set("first_name")} error={errors.first_name} />
                <Field label="Last name" autoComplete="family-name" value={form.last_name} onChange={set("last_name")} error={errors.last_name} />
                <Field
                  label="Pincode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="6 digits"
                  value={form.pincode}
                  onChange={set("pincode")}
                  error={errors.pincode}
                  hint={
                    pin?.pincode === form.pincode && pin.valid && pin.deliverable
                      ? `✓ We deliver here${pin.city ? ` (${pin.city})` : ""}`
                      : undefined
                  }
                />
                <Field label="City" autoComplete="address-level2" value={form.city} onChange={set("city")} error={errors.city} />
                <Field label="House no., building" autoComplete="address-line1" className="sm:col-span-2" value={form.address_1} onChange={set("address_1")} error={errors.address_1} />
                <Field label="Area, street, locality" autoComplete="address-line2" className="sm:col-span-2" value={form.address_2} onChange={set("address_2")} />
                <Field label="Landmark (optional)" placeholder="e.g. near City Mall" value={form.landmark} onChange={set("landmark")} />
                <SelectField label="State" autoComplete="address-level1" options={STATES} value={form.state} onChange={set("state")} error={errors.state} />
              </div>
              {customer && (
                <label className="mt-5 flex items-center gap-3 px-1 text-[14px] lg:text-[15px]">
                  <input type="checkbox" checked={!!form.save} onChange={set("save")} className="h-[16px] w-[16px] accent-black" />
                  Save this address to my account
                </label>
              )}
              {(config.optins?.email || config.optins?.whatsapp) && (
                <div className="mt-5 flex flex-col gap-3 px-1 text-[14px] lg:text-[15px]">
                  {config.optins?.whatsapp && (
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={!!form.whatsapp_optin} onChange={set("whatsapp_optin")} className="mt-[3px] h-[16px] w-[16px] accent-black" />
                      <span>
                        Send me order updates on WhatsApp
                        <span className="block text-[13px] text-black/55">Order confirmation and shipping, and a reminder if I don&apos;t finish this order.</span>
                      </span>
                    </label>
                  )}
                  {config.optins?.email && (
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={!!form.email_optin} onChange={set("email_optin")} className="mt-[3px] h-[16px] w-[16px] accent-black" />
                      <span>
                        Email me news and offers
                        <span className="block text-[13px] text-black/55">New sets, tournaments and the odd discount. Unsubscribe any time.</span>
                      </span>
                    </label>
                  )}
                </div>
              )}
              {error && <p className="mt-5 text-[15px] text-red-700" role="alert">{error}</p>}
              <PrimaryButton type="submit" disabled={busy} className="mt-8 lg:max-w-[400px]">
                {busy ? "Saving…" : "Continue to payment"}
              </PrimaryButton>
            </form>
          ) : (
            <div>
              <h1 className="text-[22px] font-semibold lg:text-[34px]">Payment</h1>
              <div className="mt-6 rounded-md bg-pill p-5 text-[14px] lg:p-6 lg:text-[16px]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Delivering to {a?.first_name} {a?.last_name}</p>
                    <p className="mt-1 text-black/70">
                      {[a?.address_1, a?.address_2, a?.city, a?.province, a?.postal_code].filter(Boolean).join(", ")}
                    </p>
                    <p className="mt-1 text-black/70">{a?.phone} · {cart.email}</p>
                  </div>
                  <button type="button" onClick={() => setPhase("address")} className="shrink-0 underline underline-offset-4">
                    Change
                  </button>
                </div>
              </div>
              <fieldset className="mt-7 space-y-4">
                <legend className="sr-only">Choose how to pay</legend>
                <PayOption
                  checked={method === "online"}
                  onSelect={() => setMethod("online")}
                  title="Pay online"
                  text="UPI, cards, net banking and wallets, through Razorpay."
                  disabled={onlineBlocked}
                />
                <PayOption
                  checked={method === "cod"}
                  onSelect={() => setMethod("cod")}
                  title="Cash on Delivery"
                  text="Pay in cash or UPI when your order arrives."
                  disabled={codBlocked}
                />
              </fieldset>
              {error && <p className="mt-5 text-[15px] text-red-700" role="alert">{error}</p>}
              <PrimaryButton type="button" disabled={busy || !method} onClick={pay} className="mt-8 lg:max-w-[400px]">
                {busy ? "Placing your order…" : method === "online" ? `Pay ${formatPrice(total)}` : "Place Order"}
              </PrimaryButton>
              <p className="mt-3 text-[13px] text-black/60 lg:text-[14px]">
                By placing the order you agree to our{" "}
                <Link href="/help/terms" className="underline">Terms</Link> and{" "}
                <Link href="/help/returns-and-warranty" className="underline">Returns policy</Link>.
              </p>
            </div>
          )}
        </div>
        <Summary cart={cart} config={config} />
      </div>
    </div>
  )
}
