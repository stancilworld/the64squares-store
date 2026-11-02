import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { type Badge, loadShopOrder, saveShopOrder } from "../../../lib/badges"
import type { ShopOrderBodyType } from "../validators"

// GET /admin/shop-order: every product in the order the shop shows them, with its badge.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ products: await loadShopOrder(req.scope) })
}

// POST /admin/shop-order { order: [product ids], badges?: { id: badge } }
export const POST = async (req: AuthenticatedMedusaRequest<ShopOrderBodyType>, res: MedusaResponse) => {
  const body = req.validatedBody
  await saveShopOrder(req.scope, body.order, (body.badges ?? {}) as Record<string, Badge>)
  res.json({ products: await loadShopOrder(req.scope) })
}
