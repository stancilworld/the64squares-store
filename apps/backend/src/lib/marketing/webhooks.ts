import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { encrypt } from "../service-keys"
import { saveSettingWorkflow } from "../../workflows/setting"
import { type EventName, MARKETING_SETTINGS_KEY, type MarketingSettings, type WebhookEndpoint, loadMarketingSettings } from "./settings"

// Webhook endpoints: other tools (a CRM, Zapier, a warehouse system) get the events they
// choose, signed with their own secret. The secret is shown once, when it's made.

const newSecret = () => `whsec_${crypto.randomBytes(24).toString("base64url")}`

const save = (c: MedusaContainer, s: MarketingSettings) =>
  saveSettingWorkflow(c).run({ input: { key: MARKETING_SETTINGS_KEY, value: s as unknown as Record<string, unknown> } })

export const createWebhook = async (c: MedusaContainer, input: { url: string; events: EventName[]; enabled?: boolean }) => {
  const s = await loadMarketingSettings(c)
  if (s.webhooks.endpoints.length >= 10) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Up to 10 webhooks.")
  const secret = newSecret()
  const ep: WebhookEndpoint = {
    id: crypto.randomBytes(8).toString("hex"),
    url: input.url,
    events: [...new Set(input.events)],
    enabled: input.enabled ?? true,
    secret_enc: encrypt(secret),
    secret_last4: secret.slice(-4),
    created_at: new Date().toISOString(),
    last_test: null,
  }
  await save(c, { ...s, webhooks: { endpoints: [...s.webhooks.endpoints, ep] } })
  return { id: ep.id, secret }
}

export const updateWebhook = async (c: MedusaContainer, id: string, input: Partial<{ url: string; events: EventName[]; enabled: boolean }>) => {
  const s = await loadMarketingSettings(c)
  if (!s.webhooks.endpoints.some((e) => e.id === id)) return false
  await save(c, {
    ...s,
    webhooks: { endpoints: s.webhooks.endpoints.map((e) => (e.id === id ? { ...e, ...input, ...(input.events ? { events: [...new Set(input.events)] } : {}), ...(input.url && input.url !== e.url ? { last_test: null } : {}) } : e)) },
  })
  return true
}

export const deleteWebhook = async (c: MedusaContainer, id: string) => {
  const s = await loadMarketingSettings(c)
  await save(c, { ...s, webhooks: { endpoints: s.webhooks.endpoints.filter((e) => e.id !== id) } })
}

export const rotateWebhookSecret = async (c: MedusaContainer, id: string) => {
  const s = await loadMarketingSettings(c)
  if (!s.webhooks.endpoints.some((e) => e.id === id)) return null
  const secret = newSecret()
  await save(c, {
    ...s,
    webhooks: { endpoints: s.webhooks.endpoints.map((e) => (e.id === id ? { ...e, secret_enc: encrypt(secret), secret_last4: secret.slice(-4) } : e)) },
  })
  return secret
}
