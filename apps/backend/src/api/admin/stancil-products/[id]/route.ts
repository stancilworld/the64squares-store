import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { type ProductForm, loadForm, saveForm } from "../../../../lib/product-form"
import type { ProductFormBodyType } from "../../validators"
import { checksFor } from "../route"

// GET /admin/stancil-products/:id: the product as the simple form shows it.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ id: req.params.id, form: await loadForm(req.scope, req.params.id) })
}

// POST /admin/stancil-products/:id: save the simple form.
export const POST = async (req: AuthenticatedMedusaRequest<ProductFormBodyType>, res: MedusaResponse) => {
  const id = await saveForm(req.scope, req.params.id, req.validatedBody as ProductForm, await checksFor(req))
  res.json({ id, form: await loadForm(req.scope, id) })
}
