import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncMailbox } from "../../../../lib/mailbox"

// POST /admin/mailbox/sync: "Check now".
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  try {
    res.json(await syncMailbox(req.scope))
  } catch (e) {
    // Another check is already running (it holds the lock).
    res.json({ ok: true, added: 0, message: "Already checking, try again in a moment." })
    void e
  }
}
