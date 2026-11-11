import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { SEO_MODULE } from "../../../../modules/seo"
import type SeoModuleService from "../../../../modules/seo/service"
import { countRedirectWorkflow } from "../../../../workflows/seo"

// GET /store/seo/redirects: old address → new address, for the website to send visitors on.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const seo: SeoModuleService = req.scope.resolve(SEO_MODULE)
  const rows = await seo.listRedirects({}, { take: 5000 })
  res.set("Cache-Control", "public, max-age=30")
  res.json({ redirects: rows.map((r) => ({ from: r.from_path, to: r.to_path, permanent: r.permanent })) })
}

// POST /store/seo/redirects { from }: counts one use (for the admin's "used N times").
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = z.object({ from: z.string().max(300) }).safeParse(req.body)
  if (parsed.success) await countRedirectWorkflow(req.scope).run({ input: parsed.data.from }).catch(() => {})
  res.status(204).send()
}
