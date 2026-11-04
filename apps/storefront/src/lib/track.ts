// Sends shop events to Google Analytics and the Meta Pixel when they're switched on
// (admin → Settings → SEO & analytics). Does nothing otherwise.

type Item = { id: string; name: string; price?: number | null; quantity?: number }
type W = Window & { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void }

const w = () => (typeof window === "undefined" ? null : (window as W))

export const trackAddToCart = (item: Item) => {
  const win = w()
  if (!win) return
  const value = (item.price ?? 0) * (item.quantity ?? 1)
  win.gtag?.("event", "add_to_cart", { currency: "INR", value, items: [{ item_id: item.id, item_name: item.name, price: item.price ?? undefined, quantity: item.quantity ?? 1 }] })
  win.fbq?.("track", "AddToCart", { currency: "INR", value, content_ids: [item.id], content_name: item.name, content_type: "product" })
}

export const trackPurchase = (order: { id: string; total: number; items: Item[] }) => {
  const win = w()
  if (!win) return
  // Once per order, even if the confirmation page is opened again.
  try {
    const key = `t64:tracked:${order.id}`
    if (win.localStorage.getItem(key)) return
    win.localStorage.setItem(key, "1")
  } catch {}
  win.gtag?.("event", "purchase", {
    transaction_id: order.id,
    currency: "INR",
    value: order.total,
    items: order.items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price ?? undefined, quantity: i.quantity ?? 1 })),
  })
  win.fbq?.("track", "Purchase", { currency: "INR", value: order.total, content_ids: order.items.map((i) => i.id), content_type: "product" })
}
