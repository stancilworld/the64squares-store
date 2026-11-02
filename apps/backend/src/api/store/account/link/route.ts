import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ensureCustomer } from "../../../../lib/customer-accounts"

// POST /store/account/link: after signing in with a code or Google, connects the sign-in to
// the customer account with that email (creating one the first time). The website then
// refreshes its token so it carries the customer.
export const POST = async (
  req: AuthenticatedMedusaRequest<{ first_name?: string; last_name?: string; phone?: string }>,
  res: MedusaResponse
) => {
  const body = (req.body ?? {}) as { first_name?: string; last_name?: string; phone?: string }
  try {
    const customer_id = await ensureCustomer(req.scope, req.auth_context.auth_identity_id!, body)
    res.json({ customer_id })
  } catch (e) {
    res.status(400).json({ message: (e as Error).message })
  }
}
