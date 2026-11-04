"use client"

import { useEffect } from "react"
import { trackPurchase } from "@/lib/track"

// Reports a just-placed order to analytics (once per order).
export function TrackPurchase({ id, total, items }: { id: string; total: number; items: { id: string; title: string; quantity: number; total: number }[] }) {
  useEffect(() => {
    // Give the analytics scripts a moment to load on the first page of the visit.
    const t = setTimeout(
      () => trackPurchase({ id, total, items: items.map((i) => ({ id: i.id, name: i.title, quantity: i.quantity, price: i.quantity ? i.total / i.quantity : i.total })) }),
      1500
    )
    return () => clearTimeout(t)
  }, [id, total, items])
  return null
}
