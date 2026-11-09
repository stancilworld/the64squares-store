import type { HttpTypes } from "@medusajs/types"
import type { TrackItem } from "./types"

// Cart lines as tracking items (the same ids the server uses for the purchase).
export const cartItems = (cart: HttpTypes.StoreCart | null | undefined): TrackItem[] =>
  (cart?.items ?? [])
    .filter((l) => !(l.metadata as { unselected?: boolean } | null)?.unselected)
    .map((l) => ({
      product_id: l.product_id ?? "",
      variant_id: l.variant_id ?? null,
      sku: l.variant?.sku ?? l.variant_sku ?? null,
      name: l.product_title ?? l.title ?? null,
      variant: l.variant_title ?? null,
      price: Number(l.unit_price ?? 0),
      quantity: Number(l.quantity ?? 1),
    }))
    .filter((i) => i.product_id)

export const lineItem = (l: HttpTypes.StoreCartLineItem): TrackItem => ({
  product_id: l.product_id ?? "",
  variant_id: l.variant_id ?? null,
  sku: l.variant?.sku ?? l.variant_sku ?? null,
  name: l.product_title ?? l.title ?? null,
  variant: l.variant_title ?? null,
  price: Number(l.unit_price ?? 0),
  quantity: Number(l.quantity ?? 1),
})
