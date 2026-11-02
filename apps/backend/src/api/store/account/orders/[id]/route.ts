import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { loadOrders, orderView } from "../../../../../lib/order-view"

// GET /store/account/orders/:id: one of the signed-in customer's orders.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customers = req.scope.resolve(Modules.CUSTOMER)
  const me = await customers.retrieveCustomer(req.auth_context.actor_id)
  const [order] = await loadOrders(req.scope, { id: req.params.id })
  if (!order || (order.customer_id !== me.id && order.email !== me.email)) {
    return res.status(404).json({ message: "Order not found" })
  }
  res.json({ order: orderView(order) })
}
