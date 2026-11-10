import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CHECKOUT_SETTINGS_KEY,
  loadCheckoutSettings,
  resolveCheckoutSettings,
} from "../../../lib/checkout-settings"
import { loadPayuStatus } from "../../../lib/payu-status"
import { getServiceKeys } from "../../../lib/service-keys"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { CheckoutSettingsBodyType } from "../validators"

// Which services are connected (never the keys themselves; the main admin manages them
// under Keys on the same page).
const keys = async (req: AuthenticatedMedusaRequest) => {
  const k = await getServiceKeys(req.scope)
  const backend = (process.env.MEDUSA_BACKEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")
  const payu = await loadPayuStatus()
  return {
    payu: !!k.payu,
    payu_test_mode: k.payuMode === "test",
    payu_webhook_at: payu.last_webhook_at ?? null,
    payu_webhook_url: `${backend}/hooks/payment/payu_payu`,
    payu_checked_at: payu.last_check_at ?? null,
    razorpay: !!k.razorpay,
    razorpay_webhook: k.razorpayWebhookSecrets.length > 0,
    razorpay_test_mode: k.razorpayMode === "test",
    resend: !!k.resendKey,
    email_from: k.emailFrom || process.env.EMAIL_FROM || "The 64 Squares <orders@the64squares.in>",
    email_reply_to: k.emailReplyTo || process.env.EMAIL_REPLY_TO || null,
    google: !!k.google,
    delhivery: !!k.delhiveryToken,
    webhook_url: `${(process.env.MEDUSA_BACKEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/hooks/payment/razorpay_razorpay`,
  }
}

// GET /admin/checkout-settings
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ settings: await loadCheckoutSettings(req.scope), keys: await keys(req) })
}

// POST /admin/checkout-settings
export const POST = async (req: AuthenticatedMedusaRequest<CheckoutSettingsBodyType>, res: MedusaResponse) => {
  const current = await loadCheckoutSettings(req.scope)
  const value = { ...current, ...req.validatedBody }
  const { result } = await saveSettingWorkflow(req.scope).run({ input: { key: CHECKOUT_SETTINGS_KEY, value } })
  res.json({ settings: resolveCheckoutSettings(result.value), keys: await keys(req) })
}
