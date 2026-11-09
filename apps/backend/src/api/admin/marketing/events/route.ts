import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETING_MODULE } from "../../../../modules/marketing"
import type MarketingModuleService from "../../../../modules/marketing/service"
import { EVENT_NAMES, PLATFORM_KEYS } from "../../../../lib/marketing/settings"

const STATUSES = ["success", "browser", "pending", "failed", "skipped"] as const
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)

// GET /admin/marketing/events: the Event Manager. Totals for the chosen dates, and the
// events themselves (newest first) with how each was delivered.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const m: MarketingModuleService = req.scope.resolve(MARKETING_MODULE)
  const q = req.query as Record<string, unknown>
  const to = str(q.to) ? new Date(String(q.to)) : new Date()
  const from = str(q.from) ? new Date(String(q.from)) : new Date(to.getTime() - 7 * 86_400_000)
  const range = { $gte: from, $lte: to }
  const platform = str(q.platform)
  const status = str(q.status)
  const name = str(q.name)
  const orderId = str(q.order_id)
  const eventId = str(q.event_id)
  const limit = Math.min(Number(q.limit) || 50, 200)
  const offset = Math.max(Number(q.offset) || 0, 0)

  // Totals.
  const count = async (filters: Record<string, unknown>) => (await m.listAndCountMarketingDeliveries({ ...filters, created_at: range } as never, { take: 1, select: ["id"] }))[1]
  const [total_events] = (await m.listAndCountMarketingEvents({ created_at: range } as never, { take: 1, select: ["id"] })).slice(1) as [number]
  const byStatus = Object.fromEntries(await Promise.all(STATUSES.map(async (s) => [s, await count({ status: s })])))
  const byPlatform = await Promise.all(
    PLATFORM_KEYS.map(async (p) => ({
      platform: p,
      total: await count({ platform: p }),
      success: await count({ platform: p, status: ["success", "browser"] }),
      failed: await count({ platform: p, status: "failed" }),
      pending: await count({ platform: p, status: "pending" }),
    }))
  )
  const byEvent = await Promise.all(EVENT_NAMES.map(async (n) => ({ name: n, total: (await m.listAndCountMarketingEvents({ name: n, created_at: range } as never, { take: 1, select: ["id"] }))[1] })))
  const [lastSuccess] = await m.listMarketingDeliveries({ status: "success" }, { take: 1, order: { delivered_at: "DESC" } })
  const recentErrors = await m.listMarketingDeliveries({ status: "failed" }, { take: 8, order: { last_attempt_at: "DESC" }, select: ["id", "event_id", "event_name", "platform", "last_error", "last_attempt_at", "attempts", "response_code"] })

  // The list. Platform / status filters pick events through their deliveries.
  const filters: Record<string, unknown> = { created_at: range }
  if (name) filters.name = name
  if (orderId) filters.order_id = orderId
  if (eventId) filters.event_id = eventId
  if (platform || status) {
    const dels = await m.listMarketingDeliveries(
      { created_at: range, ...(platform ? { platform } : {}), ...(status ? { status } : {}) } as never,
      { select: ["event_id"], take: 5000, order: { created_at: "DESC" } }
    )
    filters.event_id = eventId ? (dels.some((d) => d.event_id === eventId) ? eventId : "__none__") : [...new Set(dels.map((d) => d.event_id))]
  }
  const [events, filtered] = await m.listAndCountMarketingEvents(filters as never, { take: limit, skip: offset, order: { created_at: "DESC" } })
  const deliveries = events.length
    ? await m.listMarketingDeliveries({ event_id: events.map((e) => e.event_id) }, { select: ["id", "event_id", "platform", "channel", "status", "attempts", "last_error", "delivered_at"] })
    : []
  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      events: total_events,
      deliveries: byStatus,
      by_platform: byPlatform.filter((p) => p.total > 0),
      by_event: byEvent.filter((e) => e.total > 0),
      last_success: lastSuccess ? { platform: lastSuccess.platform, event_name: lastSuccess.event_name, at: lastSuccess.delivered_at } : null,
      recent_errors: recentErrors,
    },
    events: events.map((e) => ({
      id: e.id,
      event_id: e.event_id,
      name: e.name,
      source: e.source,
      page: e.page,
      order_id: e.order_id,
      value: e.value,
      currency: e.currency,
      created_at: e.created_at,
      consent: e.consent,
      deliveries: deliveries.filter((d) => d.event_id === e.event_id),
    })),
    count: filtered,
    limit,
    offset,
  })
}
