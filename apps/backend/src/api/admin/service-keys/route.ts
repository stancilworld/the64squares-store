import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { ipOf } from "../../../lib/activity"
import { sendEmail, storeUrl } from "../../../lib/emails"
import { checkOwnerPassword, requireOwner } from "../../../lib/owner-check"
import { OWNER_EMAIL } from "../../../lib/permissions"
import { clearPincodeCache } from "../../../lib/pincode"
import {
  KEY_DEFS,
  type KeyName,
  SERVICE_KEYS_SETTING,
  applyChanges,
  clearServiceKeyCache,
  describeServiceKeys,
  keysFromStored,
  loadStored,
} from "../../../lib/service-keys"
import { saveSettingWorkflow } from "../../../workflows/setting"

const webhookUrl = (req: AuthenticatedMedusaRequest) =>
  `${(process.env.MEDUSA_BACKEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/hooks/payment/razorpay_razorpay`

const view = async (req: AuthenticatedMedusaRequest) => ({
  ...(await describeServiceKeys(req.scope)),
  webhook_url: webhookUrl(req),
  payu_webhook_url: webhookUrl(req).replace("razorpay_razorpay", "payu_payu"),
  google_redirect_url: `${storeUrl()}/account/google`,
})

// GET /admin/service-keys: where each key is set and its last 4 characters. Main admin only.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await requireOwner(req)
  res.json(await view(req))
}

type Body = {
  password?: string
  values?: Partial<Record<KeyName, string | null>>
  razorpay_mode?: "test" | "live"
  payu_mode?: "test" | "live"
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// POST /admin/service-keys: save keys and/or switch Razorpay between Test and Live.
// Main admin only, with their password. Every change is emailed to the main admin.
export const POST = async (req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) => {
  await requireOwner(req)
  const body = (req.body ?? {}) as Body
  await checkOwnerPassword(req, body.password)

  const changes: Partial<Record<KeyName, string | null>> = {}
  for (const [name, raw] of Object.entries(body.values ?? {})) {
    const def = KEY_DEFS.find((d) => d.name === name)
    if (!def) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown key: ${name}`)
    }
    if (raw === null) {
      changes[def.name] = null
      continue
    }
    const value = def.secret ? String(raw).replace(/\s+/g, "") : String(raw).trim()
    if (!value) continue
    if (!def.pattern.test(value)) {
      const section = def.group.startsWith("razorpay") ? "Razorpay " : def.group.startsWith("payu") ? "PayU " : ""
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${section}${def.label} doesn't look right. ${def.hint}. If you didn't type in that box, your browser may have filled it in: clear it and save again.`
      )
    }
    changes[def.name] = value
  }
  const mode = body.razorpay_mode === "live" || body.razorpay_mode === "test" ? body.razorpay_mode : undefined

  const users = req.scope.resolve(Modules.USER)
  const me = await users.retrieveUser(req.auth_context.actor_id)
  const by = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email

  clearServiceKeyCache()
  const stored = await loadStored(req.scope)
  const payuMode = body.payu_mode === "live" || body.payu_mode === "test" ? body.payu_mode : undefined
  const { next, changed } = applyChanges(stored, changes, mode, by, payuMode)
  if (mode === "live" && !keysFromStored(next).razorpayFor("live")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add the Live Key Id and Live Key Secret before switching to Live mode.")
  }
  if (payuMode === "live" && !keysFromStored(next).payuFor("live")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add the PayU Live Merchant Key and Live Salt before switching PayU to Live mode.")
  }
  if (changed.length) {
    await saveSettingWorkflow(req.scope).run({
      input: { key: SERVICE_KEYS_SETTING, value: next as Record<string, unknown> },
    })
    clearServiceKeyCache()
    if (changed.some((c) => c.startsWith("Delhivery"))) {
      clearPincodeCache()
    }
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    const ip = ipOf(req) ?? ""
    const lines = changed.map((c) => `• ${c}`).join("\n")
    await sendEmail(req.scope, OWNER_EMAIL, "keys-changed", {
      subject: "The 64 Squares: payment or email keys were changed",
      text: `These keys were changed in The 64 Squares admin by ${by} on ${when}${ip ? ` (from ${ip})` : ""}:\n\n${lines}\n\nIf this wasn't you, change the main admin password straight away and check Settings → Payments & delivery.`,
      html: `<p>These keys were changed in The 64 Squares admin by <strong>${esc(by)}</strong> on ${esc(when)}${ip ? ` (from ${esc(ip)})` : ""}:</p><ul>${changed.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><p><strong>If this wasn't you</strong>, change the main admin password straight away and check Settings → Payments &amp; delivery.</p>`,
    })
  }
  res.json({ ...(await view(req)), changed })
}
