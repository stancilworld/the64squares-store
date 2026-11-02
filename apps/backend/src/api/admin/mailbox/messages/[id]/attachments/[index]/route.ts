import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { fetchAttachment } from "../../../../../../../lib/mailbox"
import { CONTENT_MODULE } from "../../../../../../../modules/content"
import type ContentModuleService from "../../../../../../../modules/content/service"

// GET /admin/mailbox/messages/:id/attachments/:index: downloads an attachment from the server.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const row = await content.retrieveMailMessage(req.params.id)
  const file = await fetchAttachment(req.scope, row as never, Number(req.params.index))
  if (!file) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That attachment isn't on the mail server any more.")
  const safe = file.filename.replace(/[^\w.\- ()]/g, "_").slice(0, 150)
  res.setHeader("Content-Type", file.contentType || "application/octet-stream")
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"`)
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.send(file.content)
}
