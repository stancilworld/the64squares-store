"use client"

import { useEffect } from "react"
import { track } from "@/lib/tracking/engine"

type Item = { id: string; title: string; variant_title?: string | null; quantity: number; total: number; product_id?: string | null; variant_id?: string | null; sku?: string | null; unit_price?: number }

// The order confirmation page: the purchase for the browser tags (Meta Pixel, Google Ads,
// GA4 unless its server copy is on). The store's server sends its own copy of the same
// purchase, with the same event id, so it's counted once. Once per order and browser.
export function TrackPurchase({ id, total, currency, items, email, phone }: { id: string; total: number; currency: string; items: Item[]; email?: string | null; phone?: string | null }) {
  useEffect(() => {
    const key = `t64:tracked:${id}`
    const done = () => {
      try {
        if (localStorage.getItem(key)) return true
        localStorage.setItem(key, "1")
      } catch {}
      return false
    }
    // Give the tags a moment to start on the first page of the visit. The order is marked as
    // sent only when it really is sent (an effect can run twice).
    const t = setTimeout(
      () =>
        !done() &&
        track("Purchase", {
          event_id: `purchase_${id}`,
          order_id: id,
          value: total,
          currency,
          person: { email, phone },
          items: items
            .filter((i) => i.product_id)
            .map((i) => ({
              product_id: i.product_id!,
              variant_id: i.variant_id ?? null,
              sku: i.sku ?? null,
              name: i.title,
              variant: i.variant_title ?? null,
              price: i.unit_price ?? (i.quantity ? i.total / i.quantity : i.total),
              quantity: i.quantity,
            })),
        }),
      1200
    )
    return () => clearTimeout(t)
  }, [id, total, currency, items, email, phone])
  return null
}
