import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { type ProductForm, loadForm, saveForm } from "../../../lib/product-form"
import { staffFor } from "../../staff-guard"
import type { ProductFormBodyType } from "../validators"

export const checksFor = async (req: AuthenticatedMedusaRequest) => {
  const staff = await staffFor(req, req.auth_context.actor_id)
  const can = (p: string) => staff.role === "admin" || staff.permissions.includes(p)
  return { canChangePrices: can("products.prices"), canDelete: can("products.delete") }
}

// POST /admin/store-products: create a product from the simple form.
export const POST = async (req: AuthenticatedMedusaRequest<ProductFormBodyType>, res: MedusaResponse) => {
  const id = await saveForm(req.scope, null, req.validatedBody as ProductForm, await checksFor(req))
  res.json({ id, form: await loadForm(req.scope, id) })
}
