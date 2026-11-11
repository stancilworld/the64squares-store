import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { loadSiteFeatures } from "../../../lib/site-features"
import { createStockAlertWorkflow } from "../../../workflows/automations"
import type { StockAlertBodyType } from "../../admin/validators"

// POST /store/stock-alerts { email, variant_id }: "Email me when it's back".
export const POST = async (req: MedusaRequest<StockAlertBodyType>, res: MedusaResponse) => {
  if (!(await loadSiteFeatures(req.scope)).back_in_stock.enabled) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Not available")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "product_id"], filters: { id: req.validatedBody.variant_id } })
  const variant = data[0] as { id: string; product_id: string } | undefined
  if (!variant) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That item wasn't found")
  await createStockAlertWorkflow(req.scope).run({ input: { email: req.validatedBody.email, variant_id: variant.id, product_id: variant.product_id } })
  res.json({ ok: true })
}
