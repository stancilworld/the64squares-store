import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETING_MODULE } from "../../../../../modules/marketing"
import type MarketingModuleService from "../../../../../modules/marketing/service"
import { PERSONAL_KEYS } from "../../../../../lib/marketing/engine"

// Customer details in a payload are shown only as "sent, hashed", never their values.
const redact = (payload: Record<string, unknown> | null) => {
  if (!payload) return null
  const out: Record<string, unknown> = { ...payload }
  const ud = out.user_data as Record<string, unknown> | undefined
  if (ud && typeof ud === "object" && !("removed_after_delivery" in ud)) {
    out.user_data = Object.fromEntries(
      Object.keys(ud).map((k) => [k, k === "client_ip_address" ? "sent (IP address)" : k === "client_user_agent" ? "sent (browser)" : k === "fbp" || k === "fbc" ? "sent (Meta browser id)" : "sent, hashed"])
    )
  }
  if (typeof out.client_id === "string") out.client_id = "sent"
  // Other platforms (email tools, WhatsApp, webhooks): contact details are hidden here too.
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== "object") return v
    return Object.fromEntries(Object.entries(v).map(([k, x]) => (PERSONAL_KEYS.has(k) && k !== "user_data" && k !== "client_id" && x !== "removed after delivery" ? [k, "sent (hidden)"] : [k, walk(x)])))
  }
  return walk(out) as Record<string, unknown>
}

// GET /admin/marketing/events/:id: one event, with every delivery and its attempts.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const m: MarketingModuleService = req.scope.resolve(MARKETING_MODULE)
  const [event] = await m.listMarketingEvents({ id: req.params.id }, { take: 1 })
  if (!event) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Event not found.")
  const deliveries = await m.listMarketingDeliveries({ event_id: event.event_id }, { order: { created_at: "ASC" } })
  res.json({
    event,
    deliveries: deliveries.map((d) => ({ ...d, payload: redact(d.payload as Record<string, unknown> | null) })),
  })
}
