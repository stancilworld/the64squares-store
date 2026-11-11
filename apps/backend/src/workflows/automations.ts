import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { AUTOMATION_MODULE } from "../modules/automation"
import type AutomationModuleService from "../modules/automation/service"
import { NEWSLETTER_MODULE } from "../modules/newsletter"
import type NewsletterModuleService from "../modules/newsletter/service"

// Back-in-stock alerts, the log of automatic emails sent, "stop these emails", and referrals.

const svc = (c: { resolve: (k: string) => unknown }) => c.resolve(AUTOMATION_MODULE) as AutomationModuleService

// ---- "Email me when it's back" ----

export type StockAlertInput = { email: string; variant_id: string; product_id: string }

const createStockAlertStep = createStep(
  "create-stock-alert",
  async (input: StockAlertInput, { container }) => {
    const s = svc(container)
    const email = input.email.trim().toLowerCase()
    const [existing] = await s.listStockAlerts({ email, variant_id: input.variant_id })
    if (existing) {
      // Asked again after an earlier email: wait for the next restock.
      if (existing.notified_at) await s.updateStockAlerts({ id: existing.id, notified_at: null })
      return new StepResponse({ id: existing.id }, { id: existing.id, created: false, notified_at: existing.notified_at })
    }
    const created = await s.createStockAlerts({ email, variant_id: input.variant_id, product_id: input.product_id })
    return new StepResponse({ id: created.id }, { id: created.id, created: true, notified_at: null as Date | null })
  },
  async (undo, { container }) => {
    if (!undo) return
    if (undo.created) await svc(container).deleteStockAlerts(undo.id)
    else if (undo.notified_at) await svc(container).updateStockAlerts({ id: undo.id, notified_at: undo.notified_at })
  }
)

export const createStockAlertWorkflow = createWorkflow("create-stock-alert", (input: StockAlertInput) => {
  return new WorkflowResponse(createStockAlertStep(input))
})

const markStockAlertsSentStep = createStep(
  "mark-stock-alerts-sent",
  async (ids: string[], { container }) => {
    const at = new Date()
    await svc(container).updateStockAlerts(ids.map((id) => ({ id, notified_at: at })))
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) await svc(container).updateStockAlerts(ids.map((id) => ({ id, notified_at: null })))
  }
)

export const markStockAlertsSentWorkflow = createWorkflow("mark-stock-alerts-sent", (ids: string[]) => {
  return new WorkflowResponse(markStockAlertsSentStep(ids))
})

// ---- The log of automatic emails ----

export type EmailLogInput = { kind: string; key: string; email: string }

// Returns false when this email was already sent (the caller then doesn't send it again).
const logAutomaticEmailStep = createStep(
  "log-automatic-email",
  async (input: EmailLogInput, { container }) => {
    const s = svc(container)
    const [existing] = await s.listEmailLogs({ kind: input.kind, key: input.key })
    if (existing) return new StepResponse({ first: false }, null)
    const created = await s.createEmailLogs({ kind: input.kind, key: input.key, email: input.email.toLowerCase() })
    return new StepResponse({ first: true }, created.id)
  },
  async (id, { container }) => {
    if (id) await svc(container).deleteEmailLogs(id)
  }
)

export const logAutomaticEmailWorkflow = createWorkflow("log-automatic-email", (input: EmailLogInput) => {
  return new WorkflowResponse(logAutomaticEmailStep(input))
})

// ---- "Stop these emails" ----

const emailOptOutStep = createStep(
  "email-opt-out",
  async (email: string, { container }) => {
    const address = email.trim().toLowerCase()
    const s = svc(container)
    const [existing] = await s.listEmailLogs({ kind: "opt_out", key: address })
    const created = existing ? null : await s.createEmailLogs({ kind: "opt_out", key: address, email: address })
    const newsletter: NewsletterModuleService = container.resolve(NEWSLETTER_MODULE)
    const subs = await newsletter.listSubscribers({ email: address })
    if (subs.length) await newsletter.softDeleteSubscribers(subs.map((x) => x.id))
    return new StepResponse({ ok: true }, { log: created?.id ?? null, subs: subs.map((x) => x.id) })
  },
  async (undo, { container }) => {
    if (!undo) return
    if (undo.log) await svc(container).deleteEmailLogs(undo.log)
    if (undo.subs.length) await (container.resolve(NEWSLETTER_MODULE) as NewsletterModuleService).restoreSubscribers(undo.subs)
  }
)

export const emailOptOutWorkflow = createWorkflow("email-opt-out", (email: string) => {
  return new WorkflowResponse(emailOptOutStep(email))
})

// ---- Referrals ----

const randomCode = (prefix: string, length = 6) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (const b of crypto.getRandomValues(new Uint8Array(length))) out += chars[b % chars.length]
  return `${prefix}${out}`
}

export type ReferralInput = { customer_id: string; give_amount: number; currency_code: string }

const findReferralStep = createStep("find-referral", async (customer_id: string, { container }) => {
  const [existing] = await svc(container).listReferrals({ customer_id })
  return new StepResponse(existing ?? null)
})

const createReferralRecordStep = createStep(
  "create-referral-record",
  async (input: { customer_id: string; code: string; promotion_id: string }, { container }) => {
    const created = await svc(container).createReferrals(input)
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (id) await svc(container).deleteReferrals(id)
  }
)

// The customer's invite code: a discount for friends (made once, kept).
export const ensureReferralWorkflow = createWorkflow("ensure-referral", (input: ReferralInput) => {
  const existing = findReferralStep(input.customer_id)
  const made = when("create-referral-when-missing", { existing }, ({ existing }) => !existing).then(() => {
    const code = transform({}, () => randomCode("FRIEND-"))
    const promotions = createPromotionsWorkflow.runAsStep({
      input: transform({ input, code }, ({ input, code }) => ({
        promotionsData: [
          {
            code,
            type: "standard" as const,
            status: "active" as const,
            is_automatic: false,
            application_method: {
              type: "fixed" as const,
              target_type: "order" as const,
              allocation: "across" as const,
              value: input.give_amount,
              currency_code: input.currency_code,
            },
          },
        ],
      })),
    })
    return createReferralRecordStep(
      transform({ input, code, promotions }, ({ input, code, promotions }) => ({ customer_id: input.customer_id, code, promotion_id: promotions[0].id }))
    )
  })
  return new WorkflowResponse(transform({ existing, made }, ({ existing, made }) => (existing ?? made)!))
})

export type ReferralRewardInput = { referral_id: string; order_id: string; get_amount: number; currency_code: string }

const countReferralUseStep = createStep(
  "count-referral-use",
  async (input: { referral_id: string; rewarded: boolean }, { container }) => {
    const s = svc(container)
    const r = await s.retrieveReferral(input.referral_id).catch(() => null)
    if (!r) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Referral not found")
    await s.updateReferrals({ id: r.id, uses: r.uses + 1, rewards: r.rewards + (input.rewarded ? 1 : 0) })
    return new StepResponse(r, { id: r.id, uses: r.uses, rewards: r.rewards })
  },
  async (undo, { container }) => {
    if (undo) await svc(container).updateReferrals(undo)
  }
)

// A friend ordered with the code: count it, and make a one-time reward code for the inviter.
export const rewardReferralWorkflow = createWorkflow("reward-referral", (input: ReferralRewardInput) => {
  const code = transform({}, () => randomCode("THANKS-"))
  const promotions = createPromotionsWorkflow.runAsStep({
    input: transform({ input, code }, ({ input, code }) => ({
      promotionsData: [
        {
          code,
          type: "standard" as const,
          status: "active" as const,
          is_automatic: false,
          limit: 1,
          application_method: {
            type: "fixed" as const,
            target_type: "order" as const,
            allocation: "across" as const,
            value: input.get_amount,
            currency_code: input.currency_code,
          },
        },
      ],
    })),
  })
  const referral = countReferralUseStep(transform({ input }, ({ input }) => ({ referral_id: input.referral_id, rewarded: true })))
  return new WorkflowResponse(transform({ code, promotions, referral }, ({ code, promotions, referral }) => ({ code, promotion_id: promotions[0].id, customer_id: referral.customer_id })))
})

// A friend ordered but no reward is due (e.g. the order was below the minimum): still counted.
export const countReferralWorkflow = createWorkflow("count-referral", (referral_id: string) => {
  return new WorkflowResponse(countReferralUseStep(transform({ referral_id }, ({ referral_id }) => ({ referral_id, rewarded: false }))))
})


// ---- Web notifications ----

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string }

const savePushSubscriptionStep = createStep(
  "save-push-subscription",
  async (input: PushSubscriptionInput, { container }) => {
    const s = svc(container)
    const [existing] = await s.listPushSubscriptions({ endpoint: input.endpoint })
    if (existing) {
      await s.updatePushSubscriptions({ id: existing.id, p256dh: input.p256dh, auth: input.auth })
      return new StepResponse({ id: existing.id }, { id: existing.id, created: false, prev: { p256dh: existing.p256dh, auth: existing.auth } })
    }
    const created = await s.createPushSubscriptions(input)
    return new StepResponse({ id: created.id }, { id: created.id, created: true, prev: null as { p256dh: string; auth: string } | null })
  },
  async (undo, { container }) => {
    if (!undo) return
    if (undo.created) await svc(container).deletePushSubscriptions(undo.id)
    else if (undo.prev) await svc(container).updatePushSubscriptions({ id: undo.id, ...undo.prev })
  }
)

export const savePushSubscriptionWorkflow = createWorkflow("save-push-subscription", (input: PushSubscriptionInput) => {
  return new WorkflowResponse(savePushSubscriptionStep(input))
})

// Browsers that turned notifications off (or no longer exist) are forgotten.
const removePushSubscriptionsStep = createStep(
  "remove-push-subscriptions",
  async (endpoints: string[], { container }) => {
    const s = svc(container)
    const rows = endpoints.length ? await s.listPushSubscriptions({ endpoint: endpoints }) : []
    if (rows.length) await s.softDeletePushSubscriptions(rows.map((r) => r.id))
    return new StepResponse(rows.length, rows.map((r) => r.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await svc(container).restorePushSubscriptions(ids)
  }
)

export const removePushSubscriptionsWorkflow = createWorkflow("remove-push-subscriptions", (endpoints: string[]) => {
  return new WorkflowResponse(removePushSubscriptionsStep(endpoints))
})

export type PushSendInput = { title: string; body: string; url: string; image_url: string | null; sent: number; failed: number }

const recordPushSendStep = createStep(
  "record-push-send",
  async (input: PushSendInput, { container }) => {
    const created = await svc(container).createPushSends(input)
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (id) await svc(container).deletePushSends(id)
  }
)

export const recordPushSendWorkflow = createWorkflow("record-push-send", (input: PushSendInput) => {
  return new WorkflowResponse(recordPushSendStep(input))
})
