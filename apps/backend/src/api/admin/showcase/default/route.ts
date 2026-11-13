import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { assetIds, DEFAULT_KEY, type Visual } from "../../../../lib/showcase"
import { SHOWCASE_MODULE } from "../../../../modules/showcase"
import type ShowcaseModuleService from "../../../../modules/showcase/service"
import { saveSettingWorkflow } from "../../../../workflows/setting"
import { refreshWebsite } from "../../../../lib/website-cache"

// POST /admin/showcase/default { visual }: what the window shows when no advert is on.
export const POST = async (req: AuthenticatedMedusaRequest<{ visual: Visual }>, res: MedusaResponse) => {
  const { visual } = req.validatedBody
  const ids = assetIds(visual)
  if (ids.length) {
    const found = await req.scope.resolve<ShowcaseModuleService>(SHOWCASE_MODULE).listShowcaseAssets({ id: ids })
    if (found.length !== new Set(ids).size) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That picture or video isn't in the library any more.")
  }
  await saveSettingWorkflow(req.scope).run({ input: { key: DEFAULT_KEY, value: { visual } } })
  await refreshWebsite(["showcase"])
  res.json({ default: visual })
}
