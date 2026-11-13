import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { assetIds, loadDefault, PLACEMENTS, SCENES, stateOf } from "../../../lib/showcase"
import { SHOWCASE_MODULE } from "../../../modules/showcase"
import type ShowcaseModuleService from "../../../modules/showcase/service"
import { createShowcaseAdWorkflow } from "../../../workflows/showcase"
import type { ShowcaseAdBodyType } from "../validators"
import { refreshWebsite } from "../../../lib/website-cache"

type Row = Record<string, any>

// GET /admin/showcase: every advert (with where it stands now and its numbers), the library
// (3D designs and uploaded art, with what uses each) and the default screen.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s = req.scope.resolve<ShowcaseModuleService>(SHOWCASE_MODULE)
  const [ads, assets, fallback] = await Promise.all([
    s.listShowcaseAds({}, { take: 500, order: { rank: "ASC", created_at: "ASC" } }) as Promise<Row[]>,
    s.listShowcaseAssets({}, { take: 1000, order: { created_at: "DESC" } }) as Promise<Row[]>,
    loadDefault(req.scope),
  ])
  const claims = new Map<string, number>()
  for (const a of ads) if (a.action?.kind === "reward" || a.action?.kind === "coupon") claims.set(a.id, (await s.listAndCountShowcaseClaims({ ad_id: a.id }, { take: 1 }))[1])
  const used = (id: string) => [...ads.filter((a) => assetIds(a.visual).includes(id)).map((a) => a.name as string), ...(assetIds(fallback).includes(id) ? ["Default screen"] : [])]
  const sceneUse = (key: string) => [...ads.filter((a) => a.visual?.kind === "scene" && a.visual.scene === key).map((a) => a.name as string), ...(fallback.kind === "scene" && fallback.scene === key ? ["Default screen"] : [])]
  res.json({
    ads: ads.map((a) => ({ ...a, state: stateOf(a), claims: claims.get(a.id) ?? 0 })),
    assets: assets.map((a) => ({ ...a, used_by: used(a.id) })),
    scenes: SCENES.map((sc) => ({ ...sc, used_by: sceneUse(sc.key) })),
    placements: PLACEMENTS,
    default: fallback,
  })
}

// POST /admin/showcase: a new advert.
export const POST = async (req: AuthenticatedMedusaRequest<ShowcaseAdBodyType>, res: MedusaResponse) => {
  const { result } = await createShowcaseAdWorkflow(req.scope).run({ input: req.validatedBody })
  await refreshWebsite(["showcase"])
  res.json({ ad: result })
}
