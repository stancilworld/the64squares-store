import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ipOf } from "../../../../../lib/activity"
import { cartFromToken } from "../../../../../lib/marketing/engine"
import { overLimit } from "../../../../../lib/marketing/limit"

// GET /store/marketing/recover/:token: what was in an abandoned checkout (from the link in a
// reminder), so the website can put it back in the shopper's cart. The link is signed.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  if (overLimit(`rc:${ipOf(req) ?? "?"}`, 30, 60_000)) return res.status(429).json({ message: "Too many tries." })
  const cartId = cartFromToken(String(req.params.token))
  if (!cartId) return res.status(404).json({ message: "This link isn't valid." })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cart", fields: ["id", "completed_at", "items.variant_id", "items.quantity", "items.metadata"], filters: { id: cartId } })
  const cart = data[0] as { completed_at?: string | null; items?: { variant_id?: string | null; quantity: number; metadata?: Record<string, unknown> | null }[] } | undefined
  if (!cart) return res.status(404).json({ message: "This cart no longer exists." })
  res.set("Cache-Control", "no-store")
  res.json({
    completed: !!cart.completed_at,
    items: (cart.items ?? [])
      .filter((i) => i.variant_id)
      .map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity), engraving: typeof i.metadata?.engraving === "string" ? i.metadata.engraving : null })),
  })
}
