import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { staffFor } from "../api/staff-guard"
import { OWNER_EMAIL } from "./permissions"

// Payment and email keys: only the main admin, and saving needs their password again.

const failures = new Map<string, number[]>()
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 5

export const requireOwner = async (req: AuthenticatedMedusaRequest) => {
  const staff = await staffFor(req, req.auth_context.actor_id)
  if (!staff.owner) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only the main admin can see or change payment and email keys.")
  }
  return staff
}

export const checkOwnerPassword = async (req: AuthenticatedMedusaRequest, password: unknown) => {
  const id = req.auth_context.actor_id
  const recent = (failures.get(id) ?? []).filter((t) => Date.now() - t < WINDOW_MS)
  if (recent.length >= MAX_FAILURES) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Too many wrong passwords. Please wait 15 minutes and try again.")
  }
  const auth = req.scope.resolve(Modules.AUTH)
  const result =
    typeof password === "string" && password
      ? await auth.authenticate("emailpass", { body: { email: OWNER_EMAIL, password } } as never)
      : { success: false }
  const userId = (result as { authIdentity?: { app_metadata?: { user_id?: string } } }).authIdentity?.app_metadata?.user_id
  if (!result.success || userId !== id) {
    failures.set(id, [...recent, Date.now()])
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "That password isn't right.")
  }
  failures.delete(id)
}
