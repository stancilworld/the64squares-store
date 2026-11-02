import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { saveModeratorDefaultsWorkflow } from "../../../../workflows/staff"
import { clearStaffCache } from "../../../staff-guard"
import type { StaffDefaultsBodyType } from "../../validators"

// POST /admin/staff/defaults (admin only): the toggles new moderators start with.
// Moderators who were never given their own toggles follow these too.
export const POST = async (
  req: AuthenticatedMedusaRequest<StaffDefaultsBodyType>,
  res: MedusaResponse
) => {
  const { result } = await saveModeratorDefaultsWorkflow(req.scope).run({
    input: { permissions: req.validatedBody.permissions },
  })
  clearStaffCache()
  res.json({ defaults: result.permissions })
}
