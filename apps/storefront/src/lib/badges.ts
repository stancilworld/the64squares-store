// Product badges and shop order, set in the admin (Products → Shop order & badges).
// Same rules as the backend's src/lib/badges.ts.

export type ProductBadge = { text: string; colour: "black" | "red" | "yellow" | "blue" }

const PRESET: Record<string, ProductBadge> = {
  new: { text: "New", colour: "yellow" },
  bestseller: { text: "Bestseller", colour: "black" },
  sale: { text: "Sale", colour: "red" },
}

export const BADGE_CLASSES: Record<ProductBadge["colour"], string> = {
  black: "bg-black text-white",
  red: "bg-love text-white",
  yellow: "bg-[#f6c445] text-black",
  blue: "bg-[#7fb2e5] text-black",
}

// `onSale`: some version's price is lower than usual (a sale price list is on).
export const badgeOf = (metadata: Record<string, unknown> | null | undefined, onSale: boolean): ProductBadge | null => {
  const b = metadata?.badge as { kind?: string; text?: string; colour?: string } | null | undefined
  const kind = b?.kind ?? "auto"
  if (kind === "none") return null
  if (kind === "custom") {
    const text = String(b?.text ?? "").trim()
    if (!text) return onSale ? PRESET.sale : null
    const colour = (["black", "red", "yellow", "blue"].includes(b?.colour ?? "") ? b!.colour : "black") as ProductBadge["colour"]
    return { text, colour }
  }
  if (PRESET[kind]) return PRESET[kind]
  return onSale ? PRESET.sale : null
}

const rankOf = (m?: Record<string, unknown> | null) => {
  const r = m?.shop_rank
  return typeof r === "number" && Number.isFinite(r) ? r : null
}

// Products added since the order was saved come first (newest first), then the saved order.
export const byShopOrder = (
  a: { id?: string; metadata?: Record<string, unknown> | null; created_at?: string | null },
  b: { id?: string; metadata?: Record<string, unknown> | null; created_at?: string | null }
) => {
  const ra = rankOf(a.metadata)
  const rb = rankOf(b.metadata)
  if (ra !== null && rb !== null) return ra - rb
  if (ra !== null) return 1
  if (rb !== null) return -1
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime() || String(a.id ?? "").localeCompare(String(b.id ?? ""))
}
