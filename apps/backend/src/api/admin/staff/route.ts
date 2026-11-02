import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ADMIN_ONLY, OWNER_EMAIL, PERMISSIONS, staffOf } from "../../../lib/permissions"
import { CONTENT_MODULE } from "../../../modules/content"
import ContentModuleService from "../../../modules/content/service"
import { loadDefaults } from "../../staff-guard"

// GET /admin/staff (admin only): everyone with admin access, their role and toggles, plus
// the list of toggles and the defaults for new moderators.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const users = req.scope.resolve(Modules.USER)
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const [list, defaults] = await Promise.all([
    users.listUsers({}, { order: { created_at: "ASC" } }),
    loadDefaults(content),
  ])
  res.json({
    staff: list.map((u) => ({
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      created_at: u.created_at,
      ...staffOf(u, defaults),
      custom: Array.isArray(u.metadata?.stancil_permissions),
    })),
    permissions: PERMISSIONS,
    defaults,
    admin_only: ADMIN_ONLY,
    owner_email: OWNER_EMAIL,
  })
}
