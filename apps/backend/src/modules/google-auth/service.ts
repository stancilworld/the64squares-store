import googleProvider from "@medusajs/medusa/auth-google"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { getServiceKeys } from "../../lib/service-keys"

// Medusa's Google sign-in, but its keys are read on every sign-in (from the admin's
// Settings → Payments & delivery → Keys, or the server's .env) instead of once at start-up,
// so Google can be switched on or changed without restarting the server.

type GoogleConfig = { clientId: string; clientSecret: string; callbackUrl: string }
type GoogleInstance = {
  config_: GoogleConfig
  authenticate(data: AuthenticationInput, s: AuthIdentityProviderService): Promise<AuthenticationResponse>
  validateCallback(data: AuthenticationInput, s: AuthIdentityProviderService): Promise<AuthenticationResponse>
}
type GoogleClass = new (cradle: Record<string, unknown>, options: GoogleConfig) => GoogleInstance

const Base = (googleProvider as unknown as { services: GoogleClass[] }).services[0]

const NOT_SET: AuthenticationResponse = { success: false, error: "Google sign-in isn't set up yet. Please use an email code." }

class DynamicGoogleAuthService extends Base {
  static identifier = "google"
  static DISPLAY_NAME = "Google"
  // Keys may be added later in the admin, so nothing is required at start-up.
  static validateOptions() {}

  private async useLatestKeys(): Promise<boolean> {
    const google = (await getServiceKeys()).google
    if (!google) {
      return false
    }
    this.config_ = { ...this.config_, clientId: google.clientId, clientSecret: google.clientSecret }
    return true
  }

  async authenticate(data: AuthenticationInput, s: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    return (await this.useLatestKeys()) ? super.authenticate(data, s) : NOT_SET
  }

  async validateCallback(data: AuthenticationInput, s: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    return (await this.useLatestKeys()) ? super.validateCallback(data, s) : NOT_SET
  }
}

export default DynamicGoogleAuthService
