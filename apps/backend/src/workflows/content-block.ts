import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

export type ContentBlockInput = {
  page?: string
  section?: string
  eyebrow?: string | null
  title?: string | null
  body?: string | null
  image_url?: string | null
  link_label?: string | null
  link_url?: string | null
  rank?: number
  is_active?: boolean
  draft?: Record<string, unknown> | null
  publish_at?: string | Date | null
  show_from?: string | Date | null
  show_until?: string | Date | null
}

const createContentBlockStep = createStep(
  "create-content-block",
  async (input: ContentBlockInput, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const block = await service.createContentBlocks(input as any)
    return new StepResponse(block, block.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.deleteContentBlocks(id)
  }
)

const updateContentBlockStep = createStep(
  "update-content-block",
  async (input: { id: string; data: ContentBlockInput }, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const previous = await service.retrieveContentBlock(input.id)
    const block = await service.updateContentBlocks({
      id: input.id,
      ...input.data,
    } as any)
    return new StepResponse(block, previous)
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updateContentBlocks(data)
  }
)

const deleteContentBlockStep = createStep(
  "delete-content-block",
  async (id: string, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.softDeleteContentBlocks(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.restoreContentBlocks(id)
  }
)

export const createContentBlockWorkflow = createWorkflow(
  "create-content-block",
  (input: ContentBlockInput) => {
    return new WorkflowResponse(createContentBlockStep(input))
  }
)

export const updateContentBlockWorkflow = createWorkflow(
  "update-content-block",
  (input: { id: string; data: ContentBlockInput }) => {
    return new WorkflowResponse(updateContentBlockStep(input))
  }
)

export const deleteContentBlockWorkflow = createWorkflow(
  "delete-content-block",
  (id: string) => {
    return new WorkflowResponse(deleteContentBlockStep(id))
  }
)
