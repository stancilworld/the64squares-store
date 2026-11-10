import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, PaymentActions } from "@medusajs/framework/utils"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { isPaid, verifyPayments } from "../modules/payu/payu"
import { notePayuCheck } from "../lib/payu-status"
import { getServiceKeys } from "../lib/service-keys"

// Every 5 minutes: PayU payments still waiting (from the last 2 days) are checked with PayU.
// A paid one becomes an order, even if the shopper closed the page after paying and no
// webhook came. This is what makes PayU work without any setup in PayU's dashboard.
export default async function payuRecheck(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const keys = await getServiceKeys(container)
  if (!keys.payuFor("test") && !keys.payuFor("live")) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const since = new Date(Date.now() - 2 * 24 * 3600_000)
  const { data } = await query.graph({
    entity: "payment_session",
    fields: ["id", "status", "amount", "data", "created_at", "updated_at"],
    filters: { provider_id: "pp_payu_payu", status: "pending", created_at: { $gte: since } } as never,
    pagination: { take: 200, order: { created_at: "DESC" } } as never,
  })
  // Give the shopper 3 minutes on PayU's page before checking.
  const waiting = (data as { id: string; amount: unknown; data: Record<string, unknown> | null; updated_at: string }[]).filter(
    (s) => s.data?.txnid && Date.now() - new Date(s.updated_at).getTime() > 3 * 60_000
  )
  let confirmed = 0
  for (const mode of ["test", "live"] as const) {
    const creds = keys.payuFor(mode)
    const batch = waiting.filter((s) => (s.data?.mode ?? "test") === mode)
    if (!creds || !batch.length) continue
    for (let i = 0; i < batch.length; i += 20) {
      const part = batch.slice(i, i + 20)
      let found: Awaited<ReturnType<typeof verifyPayments>>
      try {
        found = await verifyPayments(creds, part.map((s) => String(s.data!.txnid)))
      } catch (e) {
        logger.warn(`PayU re-check: ${(e as Error).message}`)
        continue
      }
      for (const s of part) {
        const t = found.get(String(s.data!.txnid))
        if (!isPaid(t)) continue
        try {
          await processPaymentWorkflow(container).run({ input: { action: PaymentActions.SUCCESSFUL, data: { session_id: s.id, amount: Number(t!.amt ?? s.data!.amount) } } })
          confirmed++
          logger.info(`PayU re-check: payment ${s.data!.txnid} confirmed`)
        } catch (e) {
          logger.warn(`PayU re-check: ${s.data!.txnid} paid but not completed: ${(e as Error).message}`)
        }
      }
    }
  }
  await notePayuCheck(confirmed)
}

export const config = {
  name: "payu-recheck",
  schedule: "*/5 * * * *",
}
