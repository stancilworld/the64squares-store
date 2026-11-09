import crypto from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETING_MODULE } from "../../../modules/marketing"
import type MarketingModuleService from "../../../modules/marketing/service"
import { whatsappVerifyToken } from "../../../lib/marketing/admin-view"
import { secretsOf } from "../../../lib/marketing/engine"
import { overLimit } from "../../../lib/marketing/limit"
import { ipOf } from "../../../lib/activity"

// Meta's WhatsApp webhook: delivery updates for the messages the store sent (sent, delivered,
// read, failed). Set up in Meta for Developers → WhatsApp → Configuration with the address and
// verify token shown in the admin.

// GET: Meta checks the address once, with the verify token.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const q = req.query as Record<string, string>
  if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === whatsappVerifyToken() && q["hub.challenge"]) {
    return res.status(200).send(String(q["hub.challenge"]))
  }
  res.status(403).json({ message: "Wrong verify token." })
}

const ORDER = ["sent", "delivered", "read"]

// POST: only accepted with Meta's signature (X-Hub-Signature-256, HMAC-SHA256 of the raw
// body with the app secret). Repeats are harmless: a status never goes backwards.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  if (overLimit(`wa:${ipOf(req) ?? "?"}`, 600, 60_000)) return res.status(429).json({ message: "Too many requests." })
  const secret = (await secretsOf(req.scope)).whatsapp_app_secret
  const raw = (req as MedusaRequest & { rawBody?: Buffer | string }).rawBody
  const given = String(req.headers["x-hub-signature-256"] ?? "")
  if (!secret || !raw || !given.startsWith("sha256=")) return res.status(401).json({ message: "Not signed." })
  const want = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`
  if (want.length !== given.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(given))) {
    return res.status(401).json({ message: "Bad signature." })
  }
  const body = (typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"))) as {
    entry?: { changes?: { value?: { statuses?: { id: string; status: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] }[] } }[] }[]
  }
  const m: MarketingModuleService = req.scope.resolve(MARKETING_MODULE)
  for (const st of (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((ch) => ch.value?.statuses ?? []))) {
    if (!st?.id || !st.status) continue
    const [d] = await m.listMarketingDeliveries({ external_id: st.id, platform: "whatsapp" }, { take: 1 })
    if (!d) continue
    if (st.status === "failed") {
      const e = st.errors?.[0]
      await m.updateMarketingDeliveries({ id: d.id, status: "failed", external_status: "failed", last_error: `WhatsApp couldn't deliver it: ${e?.error_data?.details || e?.message || e?.title || "unknown reason"}`.slice(0, 500) })
    } else if (ORDER.indexOf(st.status) > ORDER.indexOf(d.external_status ?? "")) {
      await m.updateMarketingDeliveries({ id: d.id, external_status: st.status })
    }
  }
  res.status(200).json({ ok: true })
}
