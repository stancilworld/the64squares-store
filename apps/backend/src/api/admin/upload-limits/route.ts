import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MAX_ALLOWED_MB, resolveLimits, UPLOAD_LIMITS_KEY } from "../../../lib/upload-limits"
import { CONTENT_MODULE } from "../../../modules/content"
import ContentModuleService from "../../../modules/content/service"
import { updateUploadLimitsWorkflow } from "../../../workflows/upload-limits"
import type { UploadLimitsBodyType } from "../validators"

// GET /admin/upload-limits: the size limit for each file type (saved or default).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const stored = await service.getSettingValue(UPLOAD_LIMITS_KEY)
  res.json({ limits: resolveLimits(stored), max_allowed_mb: MAX_ALLOWED_MB })
}

// POST /admin/upload-limits: save new limits, in MB per file type.
export const POST = async (
  req: AuthenticatedMedusaRequest<UploadLimitsBodyType>,
  res: MedusaResponse
) => {
  const limits = Object.fromEntries(
    Object.entries(req.validatedBody.limits).filter(([, v]) => typeof v === "number")
  ) as Record<string, number>
  const { result } = await updateUploadLimitsWorkflow(req.scope).run({ input: { limits } })
  res.json({ limits: resolveLimits(result.value), max_allowed_mb: MAX_ALLOWED_MB })
}
