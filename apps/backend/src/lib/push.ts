import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import webpush from "web-push"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { AUTOMATION_MODULE } from "../modules/automation"
import type AutomationModuleService from "../modules/automation/service"
import { recordPushSendWorkflow, removePushSubscriptionsWorkflow } from "../workflows/automations"
import { saveSettingWorkflow } from "../workflows/setting"
import { storeUrl } from "./emails"
import { decrypt, encrypt } from "./service-keys"

// Web notifications (Marketing → Notifications): the website's own key pair (made once, the
// private half kept encrypted), and sending one message to every browser that allowed them.

const KEYS = "push_keys"
type Stored = { public_key: string; private_enc: string }

export const pushKeys = async (c: MedusaContainer, create = false): Promise<{ publicKey: string; privateKey: string } | null> => {
  const content: ContentModuleService = c.resolve(CONTENT_MODULE)
  const stored = (await content.getSettingValue(KEYS)) as Stored | null
  const privateKey = stored?.private_enc ? decrypt(stored.private_enc) : null
  if (stored?.public_key && privateKey) return { publicKey: stored.public_key, privateKey }
  if (!create) return null
  const made = webpush.generateVAPIDKeys()
  await saveSettingWorkflow(c).run({ input: { key: KEYS, value: { public_key: made.publicKey, private_enc: encrypt(made.privateKey) } } })
  return made
}

export type PushMessage = { title: string; body: string; url: string; image_url?: string | null }

export const sendPushToAll = async (c: MedusaContainer, m: PushMessage) => {
  const keys = await pushKeys(c, true)
  if (!keys) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Notification keys are missing")
  const s: AutomationModuleService = c.resolve(AUTOMATION_MODULE)
  const subs = await s.listPushSubscriptions({}, { take: 50000 })
  const site = storeUrl()
  const payload = JSON.stringify({
    title: m.title,
    body: m.body,
    url: m.url.startsWith("http") ? m.url : `${site}${m.url.startsWith("/") ? "" : "/"}${m.url}`,
    image: m.image_url || undefined,
    icon: `${site}/brand/logo-mark.png`,
  })
  const options = { vapidDetails: { subject: site.startsWith("https") ? site : "mailto:support@the64squares.in", publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600 }
  let sent = 0
  let failed = 0
  const gone: string[] = []
  // Ten at a time.
  for (let i = 0; i < subs.length; i += 10) {
    await Promise.all(
      subs.slice(i, i + 10).map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options)
          sent++
        } catch (e) {
          failed++
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) gone.push(sub.endpoint)
        }
      })
    )
  }
  if (gone.length) await removePushSubscriptionsWorkflow(c).run({ input: gone })
  const { result } = await recordPushSendWorkflow(c).run({ input: { title: m.title, body: m.body, url: m.url, image_url: m.image_url ?? null, sent, failed } })
  return { ...result, removed: gone.length }
}
