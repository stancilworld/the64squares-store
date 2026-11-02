import { AbstractAuthModuleProvider } from "@medusajs/framework/utils"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityDTO,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import {
  OTP_MAX_ATTEMPTS,
  OTP_PROVIDER,
  type OtpMeta,
  hashCode,
  normalizeEmail,
  sameHash,
} from "../../lib/otp"

// Sign in with a 6-digit code sent by email: POST /auth/customer/otp { email, code }.
// Codes are created and emailed by POST /store/otp.
class OtpAuthService extends AbstractAuthModuleProvider {
  static identifier = OTP_PROVIDER
  static DISPLAY_NAME = "Email code"

  async register(): Promise<AuthenticationResponse> {
    return { success: false, error: "Ask for a code first, then sign in with it." }
  }

  async authenticate(
    data: AuthenticationInput,
    identities: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const body = (data.body ?? {}) as { email?: unknown; code?: unknown }
    if (typeof body.email !== "string" || typeof body.code !== "string") {
      return { success: false, error: "Enter your email and the code we sent you." }
    }
    const email = normalizeEmail(body.email)
    const code = body.code.replace(/\D/g, "")
    let identity: AuthIdentityDTO
    try {
      identity = await identities.retrieve({ entity_id: email })
    } catch {
      return { success: false, error: "That code is not right. Ask for a new one." }
    }
    const provider = identity.provider_identities?.find((p) => p.provider === OTP_PROVIDER && p.entity_id === email)
    const meta = (provider?.provider_metadata ?? {}) as OtpMeta
    if (!meta.code_hash || !meta.expires_at || Date.now() > meta.expires_at) {
      return { success: false, error: "That code has expired. Ask for a new one." }
    }
    if ((meta.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      return { success: false, error: "Too many wrong tries. Ask for a new code." }
    }
    if (!sameHash(meta.code_hash, hashCode(email, code))) {
      await identities.update(email, { provider_metadata: { ...meta, attempts: (meta.attempts ?? 0) + 1 } })
      return { success: false, error: "That code is not right. Check the email and try again." }
    }
    // A code works once.
    const updated = await identities.update(email, {
      provider_metadata: { ...meta, code_hash: null, attempts: 0, verified_at: Date.now() },
    })
    return { success: true, authIdentity: updated }
  }
}

export default OtpAuthService
