import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { SEO_MODULE } from "../../../../modules/seo"
import type SeoModuleService from "../../../../modules/seo/service"
import { upsertSeoMetaWorkflow } from "../../../../workflows/seo"
import type { SeoMetaBodyType } from "../../validators"

// POST /admin/seo/meta: a page's search title, description, share picture, focus keyword and
// "don't show in search". Products keep theirs on the product (metadata).
export const POST = async (req: AuthenticatedMedusaRequest<SeoMetaBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  if (b.target_type === "product") {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: b.target_key } })
    const metadata: Record<string, unknown> = { ...((data[0]?.metadata as Record<string, unknown>) ?? {}) }
    const map = { title: "seo_title", description: "seo_description", image_url: "seo_image", keyword: "seo_keyword", noindex: "seo_noindex" } as const
    for (const [k, mk] of Object.entries(map)) {
      const v = b[k as keyof typeof map]
      if (v !== undefined) metadata[mk] = typeof v === "string" ? v.trim() || null : v
    }
    await updateProductsWorkflow(req.scope).run({ input: { selector: { id: b.target_key }, update: { metadata } } })
    return res.json({ ok: true })
  }
  const { result } = await upsertSeoMetaWorkflow(req.scope).run({ input: b })
  res.json({ meta: result })
}

// GET /admin/seo/meta?type=news&key=news_123: one page's saved search settings.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const seo: SeoModuleService = req.scope.resolve(SEO_MODULE)
  const [m] = await seo.listSeoMetas({ target_type: String(req.query.type ?? ""), target_key: String(req.query.key ?? "") })
  res.json({ seo: m ? { title: m.title, description: m.description, image_url: m.image_url, keyword: m.keyword, noindex: m.noindex } : null })
}
