import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMailboxState } from "../../../lib/mailbox"
import { getServiceKeys } from "../../../lib/service-keys"
import { CONTENT_MODULE } from "../../../modules/content"
import type ContentModuleService from "../../../modules/content/service"

// GET /admin/mailbox: is the mailbox connected, when it last checked, any problem, and how
// many emails are new.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const keys = await getServiceKeys(req.scope)
  const state = await getMailboxState(req.scope)
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const [, unread] = await content.listAndCountMailMessages({ folder: "inbox", status: "new" } as never, { take: 1, select: ["id"] })
  res.json({
    connected: !!keys.mailbox,
    email: keys.mailbox?.email ?? null,
    last_sync_at: state.last_sync_at ?? null,
    last_error: state.last_error ?? null,
    unread,
  })
}
