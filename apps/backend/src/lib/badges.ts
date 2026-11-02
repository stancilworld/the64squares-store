import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

// Product badges and shop order (Products → Shop order & badges, and the simple product form).
// Both live in the product's metadata:
//   metadata.badge      { kind, text?, colour? }  (missing = "auto")
//   metadata.shop_rank  0, 1, 2…                  (missing = a product added since: shown first)

export const BADGE_KINDS = ["auto", "none", "new", "bestseller", "sale", "custom"] as const
export const BADGE_COLOURS = ["black", "red", "yellow", "blue"] as const
export type BadgeKind = (typeof BADGE_KINDS)[number]
export type BadgeColour = (typeof BADGE_COLOURS)[number]
export type Badge = { kind: BadgeKind; text?: string | null; colour?: BadgeColour | null }

export const AUTO_BADGE: Badge = { kind: "auto" }

export const readBadge = (metadata?: Record<string, unknown> | null): Badge => {
  const b = metadata?.badge as Badge | undefined
  if (!b || typeof b !== "object" || !BADGE_KINDS.includes(b.kind)) return AUTO_BADGE
  if (b.kind === "custom") {
    const text = String(b.text ?? "").trim()
    if (!text) return AUTO_BADGE
    return { kind: "custom", text, colour: BADGE_COLOURS.includes(b.colour as BadgeColour) ? b.colour : "black" }
  }
  return { kind: b.kind }
}

// What to store: "auto" is stored as null so products without a choice stay clean.
export const badgeForMetadata = (b?: Badge | null) => {
  if (!b || b.kind === "auto") return null
  if (b.kind === "custom") {
    const text = String(b.text ?? "").trim().slice(0, 24)
    return text ? { kind: "custom", text, colour: b.colour ?? "black" } : null
  }
  return { kind: b.kind }
}

const rankOf = (m?: Record<string, unknown> | null) => {
  const r = m?.shop_rank
  return typeof r === "number" && Number.isFinite(r) ? r : null
}

// Shop order: products added since the order was last saved come first (newest first), so a
// new product is easy to spot; then the saved order. The storefront uses the same rule.
export const byShopOrder = <T extends { id?: string; metadata?: Record<string, unknown> | null; created_at?: string | Date | null }>(a: T, b: T) => {
  const ra = rankOf(a.metadata)
  const rb = rankOf(b.metadata)
  if (ra !== null && rb !== null) return ra - rb
  if (ra !== null) return 1
  if (rb !== null) return -1
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime() || String(a.id ?? "").localeCompare(String(b.id ?? ""))
}

export type ShopOrderRow = {
  id: string
  title: string
  handle: string
  thumbnail: string | null
  status: string
  badge: Badge
}

export const loadShopOrder = async (container: MedusaContainer): Promise<ShopOrderRow[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "status", "metadata", "created_at"],
    pagination: { take: 1000 },
  })
  return [...(data as any[])].sort(byShopOrder).map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    thumbnail: p.thumbnail ?? null,
    status: p.status,
    badge: readBadge(p.metadata),
  }))
}

// Saves the order (every product gets its position) and, optionally, badges. Metadata is
// merged with what's there so other keys (age, assembly…) are kept.
export const saveShopOrder = async (
  container: MedusaContainer,
  order: string[],
  badges: Record<string, Badge> = {}
) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: [...new Set([...order, ...Object.keys(badges)])] },
    pagination: { take: 1000 },
  })
  const pos = new Map(order.map((id, i) => [id, i]))
  const updates = (data as any[]).map((p) => {
    const metadata: Record<string, unknown> = { ...((p.metadata ?? {}) as Record<string, unknown>) }
    if (pos.has(p.id)) metadata.shop_rank = pos.get(p.id)
    if (p.id in badges) metadata.badge = badgeForMetadata(badges[p.id])
    return { id: p.id, metadata }
  })
  if (updates.length) {
    await updateProductsWorkflow(container).run({ input: { products: updates } })
  }
}
