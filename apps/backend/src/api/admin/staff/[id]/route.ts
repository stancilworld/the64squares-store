import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { OWNER_EMAIL } from "../../../../lib/permissions"
import { updateStaffWorkflow } from "../../../../workflows/staff"
import { clearStaffCache } from "../../../staff-guard"
import type { StaffUpdateBodyType } from "../../validators"

// POST /admin/staff/:id (admin only): change someone's role and/or their toggles.
export const POST = async (
  req: AuthenticatedMedusaRequest<StaffUpdateBodyType>,
  res: MedusaResponse
) => {
  const users = req.scope.resolve(Modules.USER)
  const user = await users.retrieveUser(req.params.id)
  const { role, permissions } = req.validatedBody
  if (role === "moderator" && user.email.toLowerCase() === OWNER_EMAIL) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The main admin is always an admin.")
  }
  if (role === "moderator" && user.id === req.auth_context.actor_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can't make yourself a moderator. Ask another admin to do it."
    )
  }
  await updateStaffWorkflow(req.scope).run({ input: { id: user.id, role, permissions } })
  clearStaffCache()
  res.json({ id: user.id, updated: true })
}
