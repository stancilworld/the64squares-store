import { container as globalContainer } from "@medusajs/framework"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { saveSettingWorkflow } from "../workflows/setting"

// When PayU's webhook last reached the store (shown in the admin as "Webhook working").
export const PAYU_STATUS_SETTING = "payu_status"

export type PayuStatus = { last_webhook_at?: string; last_webhook_mode?: "test" | "live"; last_check_at?: string; confirmed_by_check?: number }

export const loadPayuStatus = async (): Promise<PayuStatus> => {
  try {
    const content: ContentModuleService = globalContainer.resolve(CONTENT_MODULE)
    return ((await content.getSettingValue(PAYU_STATUS_SETTING)) ?? {}) as PayuStatus
  } catch {
    return {}
  }
}

// (Content module, through the same workflow as every other setting.)
const save = async (patch: Partial<PayuStatus>) => {
  try {
    const now = await loadPayuStatus()
    await saveSettingWorkflow(globalContainer).run({ input: { key: PAYU_STATUS_SETTING, value: { ...now, ...patch } } })
  } catch {
    // Only a status note: never blocks a payment.
  }
}

export const notePayuWebhook = (mode: "test" | "live") => save({ last_webhook_at: new Date().toISOString(), last_webhook_mode: mode })
export const notePayuCheck = (confirmed: number) =>
  loadPayuStatus().then((s) => save({ last_check_at: new Date().toISOString(), confirmed_by_check: (s.confirmed_by_check ?? 0) + confirmed }))
