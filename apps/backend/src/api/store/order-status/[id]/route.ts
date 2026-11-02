import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadOrders, orderView } from "../../../../lib/order-view"

// GET /store/order-status/:id: the "thank you" page right after checkout and the link in
// the confirmation email. Order ids are long and random, so the id itself is the key
// (the same as Medusa's own GET /store/orders/:id).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const [order] = await loadOrders(req.scope, { id: req.params.id })
  if (!order) {
    return res.status(404).json({ message: "Order not found" })
  }
  res.json({ order: orderView(order) })
}
