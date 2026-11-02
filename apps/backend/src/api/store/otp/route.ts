import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { sendEmail, signInCodeEmail } from "../../../lib/emails"
import { getServiceKeys } from "../../../lib/service-keys"
import {
  OTP_MAX_PER_HOUR,
  OTP_PROVIDER,
  OTP_RESEND_MS,
  OTP_TTL_MS,
  type OtpMeta,
  hashCode,
  isEmail,
  newCode,
  normalizeEmail,
} from "../../../lib/otp"

// POST /store/otp { email }: emails a 6-digit sign-in code. The code is then used at
// POST /auth/customer/otp { email, code } (sign in) or /store/account/register (password).
// The answer is the same whether or not the email has an account.
export const POST = async (req: MedusaRequest<{ email: string }>, res: MedusaResponse) => {
  const raw = String(req.validatedBody?.email ?? (req.body as { email?: string })?.email ?? "")
  const email = normalizeEmail(raw)
  if (!isEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." })
  }
  // On the live site, codes can only be sent once the email service is connected.
  if (process.env.NODE_ENV === "production" && !(await getServiceKeys(req.scope)).resendKey) {
    return res.status(503).json({
      message: "Sign-in by email code isn't available yet. You can still check out without an account.",
    })
  }
  const auth = req.scope.resolve(Modules.AUTH)
  const now = Date.now()
  const code = newCode()

  const [existing] = await auth.listProviderIdentities({ provider: OTP_PROVIDER, entity_id: email })
  const old = (existing?.provider_metadata ?? {}) as OtpMeta
  const sent = (old.sent ?? []).filter((t) => now - t < 3_600_000)
  if (sent.length && now - sent[sent.length - 1] < OTP_RESEND_MS) {
    return res.status(429).json({ message: "We just sent a code. Please wait a few seconds before asking again." })
  }
  if (sent.length >= OTP_MAX_PER_HOUR) {
    return res.status(429).json({ message: "Too many codes asked for. Please try again in an hour." })
  }
  const meta: OtpMeta = { code_hash: hashCode(email, code), expires_at: now + OTP_TTL_MS, attempts: 0, sent: [...sent, now] }

  if (existing) {
    await auth.updateProviderIdentities({ id: existing.id, provider_metadata: { ...old, ...meta } })
  } else {
    // Same person, same account: attach the code sign-in to their password sign-in if
    // they have one (password accounts are email-verified when created).
    const [password] = await auth.listProviderIdentities({ provider: "emailpass", entity_id: email })
    if (password?.auth_identity_id) {
      await auth.createProviderIdentities({
        auth_identity_id: password.auth_identity_id,
        provider: OTP_PROVIDER,
        entity_id: email,
        provider_metadata: meta,
      })
    } else {
      await auth.createAuthIdentities({
        provider_identities: [{ provider: OTP_PROVIDER, entity_id: email, provider_metadata: meta }],
      })
    }
  }

  const ok = await sendEmail(req.scope, email, "sign-in-code", signInCodeEmail(code))
  if (!ok) {
    return res.status(502).json({ message: "We couldn't send the email just now. Please try again in a minute." })
  }
  res.json({ sent: true })
}
