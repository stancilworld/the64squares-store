import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { loadOrders, orderView } from "../../../../lib/order-view"

// GET /store/account/orders: the signed-in customer's orders, including ones placed
// without signing in using the same (verified) email.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customers = req.scope.resolve(Modules.CUSTOMER)
  const me = await customers.retrieveCustomer(req.auth_context.actor_id)
  const orders = await loadOrders(req.scope, { $or: [{ customer_id: me.id }, { email: me.email }] })
  res.json({ orders: orders.map(orderView) })
}
