"use server"

import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { getToken } from "./auth"
import { getCart } from "./cart"
import { getRegion } from "./data"
import { sdk } from "./medusa"

// Checkout runs on its own cart, built from the items ticked in the backpack. Unticked
// items stay in the backpack; after the order, the bought items leave the backpack.
const CHECKOUT = "t64_checkout"
const CART = "t64_cart"
const FIELDS =
  "id,email,currency_code,total,subtotal,tax_total,shipping_total,item_total,discount_total,completed_at,customer_id,*items,+items.metadata,+items.total,+items.compare_at_unit_price,*items.variant,*shipping_address,*shipping_methods,*payment_collection,*payment_collection.payment_sessions"

export type CheckoutConfig = {
  online: boolean
  razorpay_key_id: string | null
  cod: boolean
  cod_max: number | null
  delivery_text: string
  google: boolean
}

export type Address = {
  email: string
  first_name: string
  last_name: string
  phone: string
  address_1: string
  address_2: string
  landmark: string
  city: string
  state: string
  pincode: string
  save?: boolean
}

export type PincodeInfo = {
  pincode: string
  valid: boolean
  deliverable: boolean
  cod: boolean
  city: string | null
  state: string | null
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const fail = (e: unknown, fallback = "Something went wrong. Please try again."): { ok: false; error: string } => {
  const msg = (e as { message?: string })?.message
  return { ok: false, error: msg && !/fetch failed|ECONN/i.test(msg) ? msg : fallback }
}

// Lines are the same item when the variant and the personalisation text match.
const engravingOf = (line: { metadata?: Record<string, unknown> | null }) => {
  const e = line.metadata?.engraving
  return typeof e === "string" && e ? e : null
}
const keyOf = (variant: string, engraving: string | null) => `${variant}\u0000${engraving ?? ""}`
const fromKey = (key: string) => {
  const [variant, engraving] = key.split("\u0000")
  return { variant, engraving: engraving || null }
}

const isSelected = (line: HttpTypes.StoreCartLineItem) => !(line.metadata as { unselected?: boolean } | null)?.unselected

const auth = async (): Promise<Record<string, string>> => {
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  try {
    return await sdk.client.fetch<CheckoutConfig>("/store/checkout-config")
  } catch {
    return { online: false, razorpay_key_id: null, cod: true, cod_max: null, delivery_text: "", google: false }
  }
}

export async function checkPincode(pin: string): Promise<PincodeInfo | null> {
  try {
    return await sdk.client.fetch<PincodeInfo>(`/store/pincode/${encodeURIComponent(pin)}`)
  } catch {
    return null
  }
}

const retrieve = async (id: string) => {
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: FIELDS }, await auth())
    return cart
  } catch {
    return null
  }
}

// Builds (or brings up to date) the checkout cart from the ticked backpack items.
export async function prepareCheckout(): Promise<{ cart: HttpTypes.StoreCart | null; empty: boolean }> {
  const backpack = await getCart()
  const wanted = new Map<string, number>()
  for (const line of backpack?.items ?? []) {
    if (isSelected(line) && line.variant_id) {
      const key = keyOf(line.variant_id, engravingOf(line))
      wanted.set(key, (wanted.get(key) ?? 0) + line.quantity)
    }
  }
  if (!wanted.size) {
    return { cart: null, empty: true }
  }
  const jar = await cookies()
  const headers = await auth()
  let cart = jar.get(CHECKOUT)?.value ? await retrieve(jar.get(CHECKOUT)!.value) : null
  if (!cart || cart.completed_at) {
    const region = await getRegion()
    const created = await sdk.store.cart.create({ region_id: region?.id }, {}, headers)
    cart = created.cart
    jar.set(CHECKOUT, cart.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
  }
  if (headers.authorization && !cart.customer_id) {
    try {
      await sdk.client.fetch(`/store/carts/${cart.id}/customer`, { method: "POST", headers })
    } catch {
      // ignore
    }
  }
  const have = new Map((cart.items ?? []).map((i) => [keyOf(i.variant_id!, engravingOf(i)), i]))
  for (const [key, qty] of wanted) {
    const line = have.get(key)
    if (!line) {
      const { variant, engraving } = fromKey(key)
      await sdk.store.cart.createLineItem(cart.id, { variant_id: variant, quantity: qty, ...(engraving ? { metadata: { engraving } } : {}) }, {}, headers)
    } else if (line.quantity !== qty) {
      await sdk.store.cart.updateLineItem(cart.id, line.id, { quantity: qty }, {}, headers)
    }
  }
  for (const [key, line] of have) {
    if (!wanted.has(key)) {
      await sdk.store.cart.deleteLineItem(cart.id, line.id, {}, headers)
    }
  }
  return { cart: await retrieve(cart.id), empty: false }
}

const checkoutId = async () => (await cookies()).get(CHECKOUT)?.value ?? null

// Saves contact + delivery address and picks the (free) delivery option.
export async function saveAddress(a: Address): Promise<Result<{ cart: HttpTypes.StoreCart }>> {
  const id = await checkoutId()
  if (!id) {
    return { ok: false, error: "Your checkout expired. Please go back to your cart." }
  }
  const headers = await auth()
  const address = {
    first_name: a.first_name.trim(),
    last_name: a.last_name.trim(),
    phone: a.phone.replace(/\D/g, "").slice(-10),
    address_1: a.address_1.trim(),
    address_2: [a.address_2.trim(), a.landmark.trim() ? `Near ${a.landmark.trim()}` : ""].filter(Boolean).join(", "),
    city: a.city.trim(),
    province: a.state.trim(),
    postal_code: a.pincode.trim(),
    country_code: "in",
  }
  try {
    await sdk.store.cart.update(
      id,
      { email: a.email.trim().toLowerCase(), shipping_address: address, billing_address: address },
      {},
      headers
    )
    const { shipping_options } = await sdk.store.fulfillment.listCartOptions({ cart_id: id }, headers)
    const option = shipping_options?.[0]
    if (!option) {
      return { ok: false, error: "We can't deliver to this address yet. Please contact us." }
    }
    await sdk.store.cart.addShippingMethod(id, { option_id: option.id }, {}, headers)
    if (a.save && headers.authorization) {
      try {
        const { customer } = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me", {
          headers,
          query: { fields: "*addresses" },
        })
        const exists = (customer.addresses ?? []).some(
          (x) => x.address_1 === address.address_1 && x.postal_code === address.postal_code
        )
        if (!exists) {
          await sdk.store.customer.createAddress({ ...address, is_default_shipping: !(customer.addresses ?? []).length }, {}, headers)
        }
        if (!customer.phone || !customer.first_name) {
          await sdk.store.customer.update(
            { phone: customer.phone || address.phone, first_name: customer.first_name || address.first_name, last_name: customer.last_name || address.last_name },
            {},
            headers
          )
        }
      } catch {
        // Saving to the account is a convenience; the order still goes ahead.
      }
    }
    const cart = await retrieve(id)
    return { ok: true, cart: cart! }
  } catch (e) {
    return fail(e)
  }
}

export type PaymentStart =
  | { ok: true; method: "cod" }
  | { ok: true; method: "online"; razorpay_order_id: string; amount: number; currency: string; key_id: string }
  | { ok: false; error: string }

// Makes the payment session for the chosen method. Online: returns what Razorpay's window needs.
export async function startPayment(method: "cod" | "online"): Promise<PaymentStart> {
  const id = await checkoutId()
  if (!id) {
    return { ok: false, error: "Your checkout expired. Please go back to your cart." }
  }
  const headers = await auth()
  try {
    const cart = await retrieve(id)
    if (!cart) {
      return { ok: false, error: "Your checkout expired. Please go back to your cart." }
    }
    const provider_id = method === "cod" ? "pp_system_default" : "pp_razorpay_razorpay"
    const { payment_collection } = await sdk.store.payment.initiatePaymentSession(cart, { provider_id }, {}, headers)
    if (method === "cod") {
      return { ok: true, method: "cod" }
    }
    const session = payment_collection.payment_sessions?.find((s) => s.provider_id === provider_id)
    const data = (session?.data ?? {}) as { razorpay_order_id?: string; amount?: number; currency?: string; key_id?: string }
    if (!data.razorpay_order_id || !data.key_id) {
      return { ok: false, error: "Online payment couldn't start. Please try again or choose Cash on Delivery." }
    }
    return {
      ok: true,
      method: "online",
      razorpay_order_id: data.razorpay_order_id,
      amount: data.amount ?? 0,
      currency: data.currency ?? "INR",
      key_id: data.key_id,
    }
  } catch (e) {
    return fail(e)
  }
}

// Places the order. For online payment this runs after Razorpay's window says "paid"; the
// server checks with Razorpay itself before accepting.
export async function placeOrder(): Promise<Result<{ orderId: string }>> {
  const id = await checkoutId()
  if (!id) {
    return { ok: false, error: "Your checkout expired. Please go back to your cart." }
  }
  const headers = await auth()
  try {
    const res = await sdk.store.cart.complete(id, {}, headers)
    if (res.type !== "order") {
      return { ok: false, error: res.error?.message || "The order couldn't be placed. Please try again." }
    }
    const order = res.order
    const jar = await cookies()
    jar.delete(CHECKOUT)
    // Take the bought items out of the backpack.
    const backpackId = jar.get(CART)?.value
    if (backpackId) {
      try {
        const { cart: backpack } = await sdk.store.cart.retrieve(backpackId, { fields: "id,*items,+items.metadata" }, headers)
        const bought = new Map<string, number>()
        for (const i of order.items ?? []) {
          if (i.variant_id) {
            const key = keyOf(i.variant_id, engravingOf(i))
            bought.set(key, (bought.get(key) ?? 0) + i.quantity)
          }
        }
        for (const line of backpack.items ?? []) {
          const qty = line.variant_id ? bought.get(keyOf(line.variant_id, engravingOf(line))) : undefined
          if (!qty || !isSelected(line)) continue
          const left = line.quantity - qty
          if (left > 0) {
            await sdk.store.cart.updateLineItem(backpackId, line.id, { quantity: left }, {}, headers)
          } else {
            await sdk.store.cart.deleteLineItem(backpackId, line.id, {}, headers)
          }
        }
      } catch {
        // The order is placed either way.
      }
    }
    return { ok: true, orderId: order.id }
  } catch (e) {
    return fail(e, "The order couldn't be placed. If you paid, don't worry: we'll confirm it by email shortly.")
  }
}
