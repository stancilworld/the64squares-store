import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadCheckoutSettings } from "../../../lib/checkout-settings"
import { getServiceKeys } from "../../../lib/service-keys"

// GET /store/checkout-config: which payment methods and sign-in options the website shows.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const [s, keys] = await Promise.all([loadCheckoutSettings(req.scope), getServiceKeys(req.scope)])
  res.set("Cache-Control", "no-store")
  res.json({
    online: s.online_enabled && !!keys.razorpay,
    razorpay_key_id: keys.razorpay?.keyId ?? null,
    cod: s.cod_enabled,
    cod_max: s.cod_max,
    delivery_text: s.delivery_text,
    google: !!keys.google,
  })
}
