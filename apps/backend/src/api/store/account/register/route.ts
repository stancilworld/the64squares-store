import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ensureCustomer } from "../../../../lib/customer-accounts"
import { isEmail, normalizeEmail } from "../../../../lib/otp"

type Body = { email: string; code: string; password: string; first_name?: string; last_name?: string; phone?: string }

// POST /store/account/register: create an account with a password. The email must be
// confirmed with a code from POST /store/otp, so nobody can open an account with someone
// else's email. The website signs in with the password afterwards.
export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const body = (req.body ?? {}) as Body
  const email = normalizeEmail(String(body.email ?? ""))
  const password = String(body.password ?? "")
  if (!isEmail(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Please use a password of at least 8 characters." })
  }
  const auth = req.scope.resolve(Modules.AUTH)

  // 1. Check the code (this also uses it up).
  const check = await auth.authenticate("otp", { body: { email, code: String(body.code ?? "") } } as never)
  if (!check.success || !check.authIdentity) {
    return res.status(400).json({ message: check.error || "That code is not right." })
  }
  const authIdentityId = check.authIdentity.id

  // 2. Add (or replace) the password on the same sign-in.
  const [existing] = await auth.listProviderIdentities({ provider: "emailpass", entity_id: email })
  if (existing && existing.auth_identity_id !== authIdentityId) {
    return res.status(409).json({ message: "This email already has a password. Sign in instead, or use a code." })
  }
  if (!existing) {
    await auth.createProviderIdentities({
      auth_identity_id: authIdentityId,
      provider: "emailpass",
      entity_id: email,
      provider_metadata: {},
    })
  }
  const set = await auth.updateProvider("emailpass", { entity_id: email, password })
  if (!set.success) {
    return res.status(400).json({ message: set.error || "Could not save the password." })
  }

  // 3. Make sure there's a customer account.
  const customer_id = await ensureCustomer(req.scope, authIdentityId, body)
  res.json({ customer_id })
}
