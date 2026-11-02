import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"
import type { ContactMessageBodyType } from "../../validators"

// POST /admin/contact-messages/:id { status?, note? }: mark as read/done, keep a note.
export const POST = async (req: AuthenticatedMedusaRequest<ContactMessageBodyType>, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const message = await content.updateContactMessages({ id: req.params.id, ...req.validatedBody } as never)
  res.json({ message })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  await content.deleteContactMessages(req.params.id)
  res.json({ id: req.params.id, deleted: true })
}
