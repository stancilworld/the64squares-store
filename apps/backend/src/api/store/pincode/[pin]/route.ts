import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkPincode } from "../../../../lib/pincode"

// GET /store/pincode/:pin: can we deliver there (and is COD available), plus city/state.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json(await checkPincode(String(req.params.pin ?? "").trim()))
}
