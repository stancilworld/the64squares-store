import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { DEFAULTS_SETTING_KEY } from "../lib/permissions"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

export type StaffUpdateInput = {
  id: string
  role?: "admin" | "moderator"
  permissions?: string[]
}

// Saves a person's role and toggles in their user metadata (other metadata is kept).
const updateStaffStep = createStep(
  "update-staff",
  async (input: StaffUpdateInput, { container }) => {
    const users = container.resolve(Modules.USER)
    const user = await users.retrieveUser(input.id)
    const previous = (user.metadata ?? {}) as Record<string, unknown>
    const metadata = { ...previous }
    if (input.role) {
      metadata.t64_role = input.role
    }
    if (input.permissions) {
      metadata.t64_permissions = input.permissions
    }
    await users.updateUsers({ id: input.id, metadata })
    return new StepResponse({ id: input.id, metadata }, { id: input.id, metadata: previous })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const users = container.resolve(Modules.USER)
    await users.updateUsers({ id: undo.id, metadata: undo.metadata })
  }
)

export const updateStaffWorkflow = createWorkflow("update-staff", (input: StaffUpdateInput) => {
  return new WorkflowResponse(updateStaffStep(input))
})

type DefaultsUndo = { id: string; previous: Record<string, unknown> | null }

// Saves the toggles new moderators start with.
const saveModeratorDefaultsStep = createStep(
  "save-moderator-defaults",
  async (input: { permissions: string[] }, { container }) => {
    const content: ContentModuleService = container.resolve(CONTENT_MODULE)
    const [existing] = await content.listSettings({ key: DEFAULTS_SETTING_KEY })
    const value = { permissions: input.permissions }
    let undo: DefaultsUndo
    if (existing) {
      await content.updateSettings({ id: existing.id, value })
      undo = { id: existing.id, previous: existing.value as Record<string, unknown> }
    } else {
      const created = await content.createSettings({ key: DEFAULTS_SETTING_KEY, value })
      undo = { id: created.id, previous: null }
    }
    return new StepResponse(value, undo)
  },
  async (undo: DefaultsUndo | undefined, { container }) => {
    if (!undo) {
      return
    }
    const content: ContentModuleService = container.resolve(CONTENT_MODULE)
    if (undo.previous === null) {
      await content.deleteSettings(undo.id)
    } else {
      await content.updateSettings({ id: undo.id, value: undo.previous })
    }
  }
)

export const saveModeratorDefaultsWorkflow = createWorkflow(
  "save-moderator-defaults",
  (input: { permissions: string[] }) => new WorkflowResponse(saveModeratorDefaultsStep(input))
)
