"use server"

import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { sdk } from "./medusa"

// Customer sign-in. The token lives in an httpOnly cookie, so page scripts can't read it.
const TOKEN = "stancil_token"
const CART = "stancil_cart"
const MONTH = 60 * 60 * 24 * 30

type Result = { ok: true } | { ok: false; error: string }

const fail = (e: unknown, fallback = "Something went wrong. Please try again."): Result => {
  const msg = (e as { message?: string })?.message
  return { ok: false, error: msg && !/fetch failed|ECONN/i.test(msg) ? msg : fallback }
}

export async function getToken() {
  return (await cookies()).get(TOKEN)?.value ?? null
}

const authHeaders = async (): Promise<Record<string, string>> => {
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function getCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  const headers = await authHeaders()
  if (!headers.authorization) {
    return null
  }
  try {
    const { customer } = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me", {
      headers,
      query: { fields: "*addresses" },
    })
    return customer
  } catch {
    return null
  }
}

const saveToken = async (token: string) => {
  ;(await cookies()).set(TOKEN, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MONTH,
  })
}

// After any sign-in: make sure there's a customer account, store a token that carries it,
// and attach the current backpack to the customer.
const finishSignIn = async (token: string, names: { first_name?: string; last_name?: string; phone?: string } = {}) => {
  await sdk.client.fetch("/store/account/link", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: names,
  })
  const { token: full } = await sdk.client.fetch<{ token: string }>("/auth/token/refresh", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  })
  await saveToken(full)
  const cartId = (await cookies()).get(CART)?.value
  if (cartId) {
    try {
      await sdk.client.fetch(`/store/carts/${cartId}/customer`, { method: "POST", headers: { authorization: `Bearer ${full}` } })
    } catch {
      // A finished or foreign cart: ignore.
    }
  }
}

export async function requestCode(email: string): Promise<Result> {
  try {
    await sdk.client.fetch("/store/otp", { method: "POST", body: { email } })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function signInWithCode(email: string, code: string): Promise<Result> {
  try {
    const { token } = await sdk.client.fetch<{ token: string }>("/auth/customer/otp", {
      method: "POST",
      body: { email, code },
    })
    await finishSignIn(token)
    return { ok: true }
  } catch (e) {
    return fail(e, "That code didn't work. Please try again.")
  }
}

export async function signInWithPassword(email: string, password: string): Promise<Result> {
  try {
    const { token } = await sdk.client.fetch<{ token: string }>("/auth/customer/emailpass", {
      method: "POST",
      body: { email: email.trim().toLowerCase(), password },
    })
    await finishSignIn(token)
    return { ok: true }
  } catch (e) {
    return fail(e, "Wrong email or password.")
  }
}

export async function registerWithPassword(input: {
  email: string
  code: string
  password: string
  first_name?: string
  last_name?: string
}): Promise<Result> {
  try {
    await sdk.client.fetch("/store/account/register", { method: "POST", body: input })
    return await signInWithPassword(input.email, input.password)
  } catch (e) {
    return fail(e)
  }
}

export async function setPassword(password: string): Promise<Result> {
  try {
    await sdk.client.fetch("/store/account/password", { method: "POST", headers: await authHeaders(), body: { password } })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateDetails(input: { first_name?: string; last_name?: string; phone?: string }): Promise<Result> {
  try {
    await sdk.client.fetch("/store/customers/me", { method: "POST", headers: await authHeaders(), body: input })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteAddress(id: string): Promise<Result> {
  try {
    await sdk.client.fetch(`/store/customers/me/addresses/${id}`, { method: "DELETE", headers: await authHeaders() })
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function signOut() {
  const jar = await cookies()
  jar.delete(TOKEN)
  // The backpack belonged to the account; start a fresh one on this device.
  jar.delete(CART)
}

// Google: step 1 returns Google's sign-in page; step 2 runs on /account/google.
export async function googleStart(): Promise<{ location?: string; error?: string }> {
  try {
    const res = await sdk.client.fetch<{ location?: string }>("/auth/customer/google", { method: "POST" })
    return { location: res.location }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function googleFinish(params: Record<string, string>): Promise<Result> {
  try {
    const { token } = await sdk.client.fetch<{ token: string }>("/auth/customer/google/callback", {
      method: "POST",
      query: params,
    })
    await finishSignIn(token)
    return { ok: true }
  } catch (e) {
    return fail(e, "Google sign-in didn't work. Please try again or use an email code.")
  }
}

export type AccountOrder = {
  id: string
  display_id: number
  created_at: string
  email: string
  currency_code: string
  total: number
  item_total: number
  shipping_total: number
  tax_total: number
  discount_total: number
  step: "placed" | "packed" | "shipped" | "delivered" | "canceled"
  payment_method: string
  paid: boolean
  items: { id: string; title: string; variant_title: string | null; handle: string | null; thumbnail: string | null; quantity: number; total: number }[]
  shipping_address: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    phone?: string | null
  } | null
  tracking: { number?: string; url?: string }[]
  invoice_number: string | null
  invoice_url: string | null
}

export async function getMyOrders(): Promise<AccountOrder[]> {
  try {
    const { orders } = await sdk.client.fetch<{ orders: AccountOrder[] }>("/store/account/orders", { headers: await authHeaders() })
    return orders
  } catch {
    return []
  }
}

export async function getOrderStatus(id: string): Promise<AccountOrder | null> {
  try {
    const { order } = await sdk.client.fetch<{ order: AccountOrder }>(`/store/order-status/${id}`)
    return order
  } catch {
    return null
  }
}

export async function getMyOrder(id: string): Promise<AccountOrder | null> {
  try {
    const { order } = await sdk.client.fetch<{ order: AccountOrder }>(`/store/account/orders/${id}`, { headers: await authHeaders() })
    return order
  } catch {
    return null
  }
}
