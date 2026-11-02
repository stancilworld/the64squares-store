"use server"

import { getRegion } from "./data"
import { sdk } from "./medusa"

export type ListCard = {
  productId: string
  variantId: string | null
  title: string
  handle: string
  thumbnail: string | null
  variantTitle: string | null
  price: number | null
  inStock: boolean
  // True when the product has a single variant, so "Toss it in" can add it directly.
  singleVariant: boolean
}

// Product details for the items in a visitor's list (prices for the India region).
export async function getListCards(
  items: { productId: string; variantId: string | null }[]
): Promise<ListCard[]> {
  const ids = [...new Set(items.map((i) => i.productId))].slice(0, 100)
  if (!ids.length) {
    return []
  }
  const region = await getRegion()
  const { products } = await sdk.store.product.list({
    id: ids,
    region_id: region?.id,
    limit: ids.length,
    fields:
      "id,title,handle,thumbnail,*images,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder",
  })
  const byId = new Map(products.map((p) => [p.id, p]))
  return items.flatMap((item) => {
    const p = byId.get(item.productId)
    if (!p) {
      return []
    }
    const variants = p.variants ?? []
    const v = variants.find((x) => x.id === item.variantId) ?? (variants.length === 1 ? variants[0] : undefined)
    const prices = (v ? [v] : variants)
      .map((x) => x.calculated_price?.calculated_amount)
      .filter((n): n is number => typeof n === "number")
    const stocked = (x: (typeof variants)[number]) =>
      !x.manage_inventory || !!x.allow_backorder || (x.inventory_quantity ?? 0) > 0
    return [
      {
        productId: p.id,
        variantId: v?.id ?? null,
        title: p.title,
        handle: p.handle,
        thumbnail: p.thumbnail ?? p.images?.[0]?.url ?? null,
        variantTitle: v && variants.length > 1 ? v.title ?? null : null,
        price: prices.length ? Math.min(...prices) : null,
        inStock: v ? stocked(v) : variants.some(stocked),
        singleVariant: variants.length === 1,
      },
    ]
  })
}
