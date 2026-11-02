import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { UPLOAD_LIMITS_KEY } from "../lib/upload-limits"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

export type UploadLimitsInput = { limits: Record<string, number> }
type Undo = { id: string; previous: Record<string, unknown> | null }

// Saves the limits, keeping the previous value so a failed run can put it back.
const saveUploadLimitsStep = createStep(
  "save-upload-limits",
  async (input: UploadLimitsInput, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const [existing] = await service.listSettings({ key: UPLOAD_LIMITS_KEY })
    let undo: Undo
    if (existing) {
      await service.updateSettings({ id: existing.id, value: input.limits })
      undo = { id: existing.id, previous: existing.value as Record<string, unknown> }
    } else {
      const created = await service.createSettings({ key: UPLOAD_LIMITS_KEY, value: input.limits })
      undo = { id: created.id, previous: null }
    }
    return new StepResponse({ value: input.limits as Record<string, unknown> }, undo)
  },
  async (undo: Undo | undefined, { container }) => {
    if (!undo) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    if (undo.previous === null) {
      await service.deleteSettings(undo.id)
    } else {
      await service.updateSettings({ id: undo.id, value: undo.previous })
    }
  }
)

export const updateUploadLimitsWorkflow = createWorkflow(
  "update-upload-limits",
  (input: UploadLimitsInput) => {
    const setting = saveUploadLimitsStep(input)
    return new WorkflowResponse(setting)
  }
)
