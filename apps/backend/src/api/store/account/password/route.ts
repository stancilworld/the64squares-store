import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { emailOfIdentity } from "../../../../lib/customer-accounts"

// POST /store/account/password { password }: a signed-in customer sets or changes their
// password (also how a forgotten password is replaced: sign in with a code, then set one).
export const POST = async (req: AuthenticatedMedusaRequest<{ password: string }>, res: MedusaResponse) => {
  const password = String((req.body as { password?: string })?.password ?? "")
  if (password.length < 8) {
    return res.status(400).json({ message: "Please use a password of at least 8 characters." })
  }
  const auth = req.scope.resolve(Modules.AUTH)
  const authIdentityId = req.auth_context.auth_identity_id!
  const { email } = await emailOfIdentity(req.scope, authIdentityId)
  if (!email) {
    return res.status(400).json({ message: "Your account has no email address." })
  }
  const [existing] = await auth.listProviderIdentities({ provider: "emailpass", entity_id: email })
  if (existing && existing.auth_identity_id !== authIdentityId) {
    return res.status(409).json({ message: "This email's password belongs to another sign-in. Please contact us." })
  }
  if (!existing) {
    await auth.createProviderIdentities({ auth_identity_id: authIdentityId, provider: "emailpass", entity_id: email, provider_metadata: {} })
  }
  const set = await auth.updateProvider("emailpass", { entity_id: email, password })
  if (!set.success) {
    return res.status(400).json({ message: set.error || "Could not save the password." })
  }
  res.json({ ok: true })
}
