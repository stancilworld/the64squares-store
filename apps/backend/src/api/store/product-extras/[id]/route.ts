import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { loadCheckoutSettings } from "../../../../lib/checkout-settings"
import { CART_WINDOW_DAYS, cartsLabelCount } from "../../../../lib/product-extras"

// GET /store/product-extras/:id?price_list_id=...
// in_carts: how many shoppers' open carts (updated in the last few days) hold this product,
// rounded down, or null when under the minimum set in the admin.
// sale_ends_at: when the sale price list ends, if it is a sale with an end date.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = req.params.id
  const settings = await loadCheckoutSettings(req.scope)

  let inCarts: number | null = null
  if (settings.in_carts_enabled) {
    const since = new Date(Date.now() - CART_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const cartModule = req.scope.resolve(Modules.CART)
    const items = await cartModule.listLineItems(
      // updated_at isn't in the typed filters but is a normal column filter.
      { product_id: productId, updated_at: { $gte: since } } as Parameters<typeof cartModule.listLineItems>[0],
      { select: ["id", "cart_id"], relations: ["cart"], take: 5000 }
    )
    const carts = new Set(
      items
        .filter((i) => !(i as { cart?: { completed_at?: Date | null; deleted_at?: Date | null } }).cart?.completed_at)
        .map((i) => i.cart_id)
    )
    inCarts = cartsLabelCount(carts.size, settings.in_carts_min)
  }

  let saleEndsAt: string | null = null
  const priceListId = typeof req.query.price_list_id === "string" ? req.query.price_list_id : ""
  if (priceListId) {
    const pricing = req.scope.resolve(Modules.PRICING)
    const [list] = await pricing.listPriceLists({ id: priceListId }, { select: ["id", "type", "status", "ends_at"] })
    const ends = list?.ends_at ? new Date(list.ends_at) : null
    if (list && list.type === "sale" && list.status === "active" && ends && ends > new Date()) {
      saleEndsAt = ends.toISOString()
    }
  }

  res.set("Cache-Control", "public, max-age=300")
  res.json({ in_carts: inCarts, sale_ends_at: saleEndsAt })
}
