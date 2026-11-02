import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { testAiProviders } from "../../../../lib/chatbot"
import { sendEmail } from "../../../../lib/emails"
import { testMailbox } from "../../../../lib/mailbox"
import { requireOwner } from "../../../../lib/owner-check"
import { OWNER_EMAIL } from "../../../../lib/permissions"
import { clearServiceKeyCache, getServiceKeys } from "../../../../lib/service-keys"

type Service = "razorpay_test" | "razorpay_live" | "resend" | "delhivery" | "mailbox" | "ai"

const timeout = (ms: number) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

// (Not called "test": the build leaves out folders with that name.)
// POST /admin/service-keys/check { service }: checks the saved key with the service.
// Main admin only. Answers { ok, message }.
export const POST = async (req: AuthenticatedMedusaRequest<{ service: Service }>, res: MedusaResponse) => {
  await requireOwner(req)
  clearServiceKeyCache()
  const keys = await getServiceKeys(req.scope)
  const service = (req.body as { service?: Service })?.service
  try {
    if (service === "razorpay_test" || service === "razorpay_live") {
      const mode = service === "razorpay_live" ? "live" : "test"
      const creds = keys.razorpayFor(mode)
      if (!creds) {
        return res.json({ ok: false, message: `Add the ${mode === "live" ? "Live" : "Test"} Key Id and Key Secret first, then Save.` })
      }
      const base = (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1").replace(/\/$/, "")
      const r = await fetch(`${base}/orders?count=1`, {
        headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}` },
        signal: timeout(8000),
      })
      return res.json(
        r.ok
          ? { ok: true, message: `Razorpay accepted the ${mode === "live" ? "Live" : "Test"} keys.` }
          : { ok: false, message: r.status === 401 ? "Razorpay rejected these keys. Check the Key Id and Key Secret." : `Razorpay answered with an error (${r.status}).` }
      )
    }
    if (service === "resend") {
      if (!keys.resendKey) {
        return res.json({ ok: false, message: "Add the Resend API key first, then Save." })
      }
      const sent = await sendEmail(req.scope, OWNER_EMAIL, "test-email", {
        subject: "Test email from The64Squares admin",
        text: "If you're reading this, The64Squares's emails work: order confirmations, shipping updates and sign-in codes will arrive like this one.",
        html: "<p>If you're reading this, The64Squares's emails work: order confirmations, shipping updates and sign-in codes will arrive like this one.</p>",
      })
      return res.json(
        sent
          ? { ok: true, message: `Test email sent to ${OWNER_EMAIL}. Check the inbox (and spam).` }
          : { ok: false, message: "Resend refused the email. Check the API key, and that the sender's domain shows Verified in Resend." }
      )
    }
    if (service === "ai") {
      return res.json(await testAiProviders(req.scope))
    }
    if (service === "mailbox") {
      return res.json(await testMailbox(req.scope))
    }
    if (service === "delhivery") {
      if (!keys.delhiveryToken) {
        return res.json({ ok: false, message: "Add the Delhivery token first, then Save." })
      }
      const base = (process.env.DELHIVERY_API_BASE || "https://track.delhivery.com").replace(/\/$/, "")
      const r = await fetch(`${base}/c/api/pin-codes/json/?filter_codes=110001`, {
        headers: { Authorization: `Token ${keys.delhiveryToken}`, Accept: "application/json" },
        signal: timeout(8000),
      })
      const json = (await r.json().catch(() => null)) as { delivery_codes?: unknown[] } | null
      return res.json(
        r.ok && Array.isArray(json?.delivery_codes)
          ? { ok: true, message: "Delhivery accepted the token." }
          : { ok: false, message: "Delhivery rejected the token. Check it in Delhivery One → Settings → API Setup." }
      )
    }
    return res.status(400).json({ ok: false, message: "Unknown service." })
  } catch {
    return res.json({ ok: false, message: "The service didn't answer. Try again in a minute." })
  }
}
