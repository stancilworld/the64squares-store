import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MARKETING_MODULE } from "../modules/marketing"
import type MarketingModuleService from "../modules/marketing/service"
import { type CollectInput, collect } from "../lib/marketing/collector"
import { customerHash } from "../lib/marketing/events"
import { trackAbandoned, trackPurchase, trackRefund, trackRegistration, trackShipped, trackSubscribe } from "../lib/marketing/engine"

// Marketing & integrations. Recording events is append-only (nothing to undo); sending
// happens afterwards, in the background (lib/marketing/engine.ts dispatchDue).

const recordMarketingEventsStep = createStep("record-marketing-events", async (input: CollectInput, { container }) => {
  return new StepResponse(await collect(container, input))
})

// Events reported by the website.
export const collectMarketingEventsWorkflow = createWorkflow("collect-marketing-events", (input: CollectInput) => {
  return new WorkflowResponse(recordMarketingEventsStep(input))
})

type ServerEventInput = { kind: "purchase" | "refund" | "registration" | "shipped" | "abandoned" | "subscribe"; id: string; first_name?: string | null; last_name?: string | null; source?: string }

const recordServerEventStep = createStep("record-server-event", async (input: ServerEventInput, { container }) => {
  const ids =
    input.kind === "purchase"
      ? await trackPurchase(container, input.id)
      : input.kind === "refund"
        ? await trackRefund(container, input.id)
        : input.kind === "shipped"
          ? await trackShipped(container, input.id)
          : input.kind === "abandoned"
            ? await trackAbandoned(container, input.id)
            : input.kind === "subscribe"
              ? await trackSubscribe(container, { email: input.id, first_name: input.first_name, last_name: input.last_name, source: input.source ?? "newsletter" })
              : await trackRegistration(container, input.id)
  return new StepResponse({ ids })
})

// Events the store makes itself: a confirmed order, a refund, a new account, a shipment, an
// abandoned checkout, a newsletter sign-up.
export const trackServerEventWorkflow = createWorkflow("track-server-event", (input: ServerEventInput) => {
  return new WorkflowResponse(recordServerEventStep(input))
})

type RetryInput = { ids?: string[]; all_failed?: boolean }

const requeueDeliveriesStep = createStep(
  "requeue-deliveries",
  async (input: RetryInput, { container }) => {
    const m: MarketingModuleService = container.resolve(MARKETING_MODULE)
    const rows = input.all_failed
      ? await m.listMarketingDeliveries({ status: "failed", channel: "server" }, { take: 500 })
      : await m.listMarketingDeliveries({ id: input.ids ?? [], channel: "server", status: ["failed", "pending"] })
    const before = rows.map((r) => ({ id: r.id, status: r.status, attempts: r.attempts, next_attempt_at: r.next_attempt_at }))
    if (rows.length) {
      await m.updateMarketingDeliveries(rows.map((r) => ({ id: r.id, status: "pending", attempts: 0, next_attempt_at: new Date() })))
    }
    return new StepResponse({ ids: rows.map((r) => r.id) }, before)
  },
  async (before, { container }) => {
    if (!before?.length) return
    const m: MarketingModuleService = container.resolve(MARKETING_MODULE)
    await m.updateMarketingDeliveries(before)
  }
)

// Puts failed deliveries back in the queue (Event Manager → Retry).
export const retryMarketingDeliveriesWorkflow = createWorkflow("retry-marketing-deliveries", (input: RetryInput) => {
  return new WorkflowResponse(requeueDeliveriesStep(input))
})

type DeleteInput = { order_id?: string; email?: string }

const deleteMarketingRecordsStep = createStep("delete-marketing-records", async (input: DeleteInput, { container }) => {
  const m: MarketingModuleService = container.resolve(MARKETING_MODULE)
  const filters: Record<string, unknown>[] = []
  if (input.order_id) filters.push({ order_id: input.order_id })
  if (input.email) filters.push({ customer_hash: customerHash(input.email) })
  let events = 0
  let deliveries = 0
  for (const f of filters) {
    const evs = await m.listMarketingEvents(f, { select: ["id", "event_id"], take: 5000 })
    if (!evs.length) continue
    const dels = await m.listMarketingDeliveries({ event_id: evs.map((e) => e.event_id) }, { select: ["id"], take: 20000 })
    if (dels.length) await m.deleteMarketingDeliveries(dels.map((d) => d.id))
    await m.deleteMarketingEvents(evs.map((e) => e.id))
    events += evs.length
    deliveries += dels.length
  }
  return new StepResponse({ events, deliveries })
})

// Deletes everything recorded about one order or one customer (Privacy → Delete data).
export const deleteMarketingDataWorkflow = createWorkflow("delete-marketing-data", (input: DeleteInput) => {
  return new WorkflowResponse(deleteMarketingRecordsStep(input))
})
