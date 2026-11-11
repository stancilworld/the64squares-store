import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { logNotFoundWorkflow } from "../../../../workflows/seo"

// POST /store/seo/not-found { path, referrer }: the website's "page not found" reports here.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = z.object({ path: z.string().min(1).max(300), referrer: z.string().max(300).nullable().optional() }).safeParse(req.body)
  if (parsed.success) await logNotFoundWorkflow(req.scope).run({ input: parsed.data }).catch(() => {})
  res.status(204).send()
}
