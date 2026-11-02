import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Staff & permissions launch: everyone who already had admin access keeps full access
 * (marked as admin). People added after this start as moderators with the default toggles,
 * and the main admin (the owner email (OWNER_EMAIL)) is always an admin. Runs once.
 */
export default async function staff_roles_v1({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const users = container.resolve(Modules.USER)
  const list = await users.listUsers({})
  for (const u of list) {
    const meta = (u.metadata ?? {}) as Record<string, unknown>
    if (!meta.t64_role) {
      await users.updateUsers({ id: u.id, metadata: { ...meta, t64_role: "admin" } })
      logger.info(`Staff roles: ${u.email} kept as admin.`)
    }
  }
}
