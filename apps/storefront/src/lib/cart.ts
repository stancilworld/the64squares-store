"use server"

import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { getRegion } from "./data"
import { sdk } from "./medusa"

const COOKIE = "stancil_cart"
const CART_FIELDS =
  "id,currency_code,total,subtotal,tax_total,shipping_total,item_total,discount_total,*items,+items.metadata,+items.compare_at_unit_price,+items.total,+items.subtotal,+items.tax_total,+items.original_total,+items.discount_total,*items.variant,*items.variant.options,*items.variant.options.option,*items.product"

export async function getCart(): Promise<HttpTypes.StoreCart | null> {
  const id = (await cookies()).get(COOKIE)?.value
  if (!id) {
    return null
  }
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: CART_FIELDS })
    return cart
  } catch {
    return null
  }
}

async function ensureCart(): Promise<string> {
  const existing = await getCart()
  if (existing) {
    return existing.id
  }
  const region = await getRegion()
  const { cart } = await sdk.store.cart.create({ region_id: region?.id })
  ;(await cookies()).set(COOKIE, cart.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return cart.id
}

// Number of items in the cart, for the counter on the cart icon.
export async function getCartCount(): Promise<number> {
  const id = (await cookies()).get(COOKIE)?.value
  if (!id) {
    return 0
  }
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: "id,items.quantity" })
    return (cart.items ?? []).reduce((n, i) => n + (i.quantity ?? 0), 0)
  } catch {
    return 0
  }
}

export async function addToCart(variantId: string, quantity = 1) {
  const id = await ensureCart()
  await sdk.store.cart.createLineItem(id, { variant_id: variantId, quantity })
  return { ok: true }
}

export async function updateLine(lineId: string, quantity: number) {
  const cart = await getCart()
  if (!cart) {
    return
  }
  if (quantity < 1) {
    await sdk.store.cart.deleteLineItem(cart.id, lineId)
  } else {
    await sdk.store.cart.updateLineItem(cart.id, lineId, { quantity })
  }
}

export async function removeLine(lineId: string) {
  const cart = await getCart()
  if (cart) {
    await sdk.store.cart.deleteLineItem(cart.id, lineId)
  }
}

// Ticked items go to checkout; unticked ones stay in the backpack for later.
export async function setLineSelected(lineId: string, selected: boolean) {
  const cart = await getCart()
  const line = cart?.items?.find((i) => i.id === lineId)
  if (!cart || !line) {
    return
  }
  await sdk.store.cart.updateLineItem(cart.id, lineId, {
    quantity: line.quantity,
    metadata: { ...(line.metadata ?? {}), unselected: !selected },
  })
}
