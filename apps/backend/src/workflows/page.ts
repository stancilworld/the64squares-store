import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

export type PageInput = {
  handle?: string
  title?: string
  body?: string
  is_published?: boolean
  rank?: number
}

const createPageStep = createStep(
  "create-page",
  async (input: PageInput, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const page = await service.createPages(input as any)
    return new StepResponse(page, page.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.deletePages(id)
  }
)

const updatePageStep = createStep(
  "update-page",
  async (input: { id: string; data: PageInput }, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const previous = await service.retrievePage(input.id)
    const page = await service.updatePages({ id: input.id, ...input.data } as any)
    return new StepResponse(page, previous)
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updatePages(data)
  }
)

const deletePageStep = createStep(
  "delete-page",
  async (id: string, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.softDeletePages(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.restorePages(id)
  }
)

export const createPageWorkflow = createWorkflow(
  "create-page",
  (input: PageInput) => {
    return new WorkflowResponse(createPageStep(input))
  }
)

export const updatePageWorkflow = createWorkflow(
  "update-page",
  (input: { id: string; data: PageInput }) => {
    return new WorkflowResponse(updatePageStep(input))
  }
)

export const deletePageWorkflow = createWorkflow(
  "delete-page",
  (id: string) => {
    return new WorkflowResponse(deletePageStep(id))
  }
)
