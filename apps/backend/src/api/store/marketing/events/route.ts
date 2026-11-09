import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ipOf } from "../../../../lib/activity"
import { dispatchSoon } from "../../../../lib/marketing/engine"
import { fromStore, overLimit } from "../../../../lib/marketing/limit"
import { collectMarketingEventsWorkflow } from "../../../../workflows/marketing"
import type { CollectBodyType } from "../../../admin/validators"

// POST /store/marketing/events: shop events from the website (product views, add to cart...).
// Recorded for the Event Manager and, with the visitor's consent, sent on to the platforms
// this server talks to itself. Purchases and refunds are never taken from here.
export const POST = async (req: MedusaRequest<CollectBodyType>, res: MedusaResponse) => {
  if (!fromStore(req.headers.origin)) {
    return res.status(403).json({ message: "Not allowed." })
  }
  const ip = ipOf(req)
  const body = req.validatedBody
  if (overLimit(`m:${ip ?? "?"}`, 240, 60_000)) {
    return res.status(429).json({ message: "Too many events." })
  }
  const { result } = await collectMarketingEventsWorkflow(req.scope).run({
    input: {
      consent: body.consent,
      visitor: body.visitor ?? {},
      utm: body.utm ?? null,
      events: body.events.map((e) => ({ ...e, sent: e.sent ?? [], data: e.data ?? {} })),
      ip,
      user_agent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
    },
  })
  dispatchSoon(req.scope, result.queued)
  res.status(202).json({ accepted: result.accepted })
}
