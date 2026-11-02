import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

// Saves one site setting (a JSON value under a key), keeping the previous value so a
// failed run can put it back.
export type SaveSettingInput = { key: string; value: Record<string, unknown> }
type Undo = { id: string; previous: Record<string, unknown> | null }

const saveSettingStep = createStep(
  "save-setting",
  async (input: SaveSettingInput, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const [existing] = await service.listSettings({ key: input.key })
    let undo: Undo
    if (existing) {
      await service.updateSettings({ id: existing.id, value: input.value })
      undo = { id: existing.id, previous: existing.value as Record<string, unknown> }
    } else {
      const created = await service.createSettings({ key: input.key, value: input.value })
      undo = { id: created.id, previous: null }
    }
    return new StepResponse({ value: input.value }, undo)
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

export const saveSettingWorkflow = createWorkflow("save-setting", (input: SaveSettingInput) => {
  return new WorkflowResponse(saveSettingStep(input))
})
