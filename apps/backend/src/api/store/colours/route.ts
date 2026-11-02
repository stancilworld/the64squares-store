import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadSharedOptions } from "../../../lib/product-form"

// GET /store/colours: { "sky blue": "#7fb2e5", ... } — swatch colours set in the admin's
// simple product form, for the website's colour buttons and filters.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { colour } = await loadSharedOptions(req.scope)
  const map: Record<string, string> = {}
  for (const v of (colour?.values ?? []) as { value: string; metadata?: { swatch?: string } | null }[]) {
    if (v.metadata?.swatch) map[v.value.trim().toLowerCase()] = v.metadata.swatch
  }
  res.set("Cache-Control", "public, max-age=60")
  res.json({ colours: map })
}
