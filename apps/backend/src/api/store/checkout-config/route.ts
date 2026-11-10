import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadCheckoutSettings } from "../../../lib/checkout-settings"
import { secretsOf } from "../../../lib/marketing/engine"
import { isLive, loadMarketingSettings } from "../../../lib/marketing/settings"
import { getServiceKeys } from "../../../lib/service-keys"

// GET /store/checkout-config: which payment methods and sign-in options the website shows.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const [s, keys, m, k] = await Promise.all([loadCheckoutSettings(req.scope), getServiceKeys(req.scope), loadMarketingSettings(req.scope), secretsOf(req.scope)])
  res.set("Cache-Control", "no-store")
  res.json({
    online: s.online_enabled && !!keys.razorpay,
    razorpay_key_id: keys.razorpay?.keyId ?? null,
    payu: s.payu_enabled && !!keys.payu,
    cod: s.cod_enabled,
    cod_max: s.cod_max,
    delivery_text: s.delivery_text,
    dispatch_days: s.dispatch_days,
    transit_days: s.transit_days,
    dispatch_from: s.dispatch_from,
    returns_text: s.returns_text,
    google: !!keys.google,
    // The opt-in boxes at checkout, shown only when something uses them.
    optins: {
      email: (["brevo", "mailchimp", "klaviyo"] as const).some((i) => isLive(m, i, k)),
      whatsapp: isLive(m, "whatsapp", k),
    },
  })
}
