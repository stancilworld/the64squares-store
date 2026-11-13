import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { type AssetInput, createShowcaseAssetWorkflow } from "../../../../workflows/showcase"

// POST /admin/showcase/assets: add an uploaded file (POST /admin/uploads first) to the library.
export const POST = async (req: AuthenticatedMedusaRequest<AssetInput>, res: MedusaResponse) => {
  const { result } = await createShowcaseAssetWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ asset: result })
}
