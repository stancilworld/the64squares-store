import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { normalizeEmail } from "./otp"

type Names = { first_name?: string; last_name?: string; phone?: string }

// The (verified) email behind a sign-in: the code or password email, or Google's email.
export const emailOfIdentity = async (container: MedusaContainer, authIdentityId: string) => {
  const auth = container.resolve(Modules.AUTH)
  const identity = await auth.retrieveAuthIdentity(authIdentityId, { relations: ["provider_identities"] })
  for (const p of identity.provider_identities ?? []) {
    if (p.provider === "otp" || p.provider === "emailpass") {
      return { identity, email: normalizeEmail(p.entity_id) }
    }
    const meta = (p.user_metadata ?? {}) as { email?: string }
    if (p.provider === "google" && meta.email) {
      return { identity, email: normalizeEmail(meta.email) }
    }
  }
  return { identity, email: null }
}

// Makes sure a sign-in belongs to a customer account: the existing account with the same
// email, or a new one. Returns the customer id.
export const ensureCustomer = async (container: MedusaContainer, authIdentityId: string, names: Names = {}) => {
  const auth = container.resolve(Modules.AUTH)
  const customers = container.resolve(Modules.CUSTOMER)
  const { identity, email } = await emailOfIdentity(container, authIdentityId)
  const appMeta = (identity.app_metadata ?? {}) as Record<string, unknown>
  if (typeof appMeta.customer_id === "string" && appMeta.customer_id) {
    return appMeta.customer_id
  }
  if (!email) {
    throw new Error("This sign-in has no email address.")
  }
  const [existing] = await customers.listCustomers({ email, has_account: true }, { take: 1 })
  if (existing) {
    await auth.updateAuthIdentities({ id: identity.id, app_metadata: { ...appMeta, customer_id: existing.id } })
    return existing.id
  }
  const google = identity.provider_identities?.find((p) => p.provider === "google")?.user_metadata as
    | { given_name?: string; family_name?: string; name?: string }
    | undefined
  // Someone who ordered before making an account: take their name and phone from that order.
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: past } = await query.graph({
    entity: "order",
    fields: ["created_at", "shipping_address.first_name", "shipping_address.last_name", "shipping_address.phone"],
    filters: { email },
  })
  const last = [...(past as { created_at: string; shipping_address?: Record<string, string | null> | null }[])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.shipping_address
  const { result } = await createCustomerAccountWorkflow(container).run({
    input: {
      authIdentityId: identity.id,
      customerData: {
        email,
        first_name: names.first_name || google?.given_name || last?.first_name || undefined,
        last_name: names.last_name || google?.family_name || last?.last_name || undefined,
        phone: names.phone || last?.phone || undefined,
      },
    },
  })
  return result.id
}
