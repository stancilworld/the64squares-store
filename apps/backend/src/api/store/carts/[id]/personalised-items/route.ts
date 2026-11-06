import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addPersonalisedItemWorkflow } from "../../../../../workflows/personalised-item"
import type { PersonalisedItemBodyType } from "../../../../admin/validators"

// POST /store/carts/:id/personalised-items: adds an item with paid personalisation.
export const POST = async (req: MedusaRequest<PersonalisedItemBodyType>, res: MedusaResponse) => {
  const { variant_id, quantity, text } = req.validatedBody
  const { result } = await addPersonalisedItemWorkflow(req.scope).run({
    input: { cart_id: req.params.id, variant_id, quantity, text },
  })
  res.json({ ok: true, unit_price: result.unit_price, fee: result.fee })
}
