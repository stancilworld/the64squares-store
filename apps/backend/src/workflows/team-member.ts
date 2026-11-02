import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

export type TeamMemberInput = {
  name?: string
  role?: string | null
  image_url?: string | null
  color_image_url?: string | null
  canvas_width?: number | null
  canvas_height?: number | null
  box?: { x: number; y: number; width: number; height: number } | null
  mask?: string | null
  rank?: number
  is_active?: boolean
}

const createTeamMemberStep = createStep(
  "create-team-member",
  async (input: TeamMemberInput, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const member = await service.createTeamMembers(input as any)
    return new StepResponse(member, member.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.deleteTeamMembers(id)
  }
)

const updateTeamMemberStep = createStep(
  "update-team-member",
  async (input: { id: string; data: TeamMemberInput }, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const previous = await service.retrieveTeamMember(input.id)
    const member = await service.updateTeamMembers({ id: input.id, ...input.data } as any)
    return new StepResponse(member, previous)
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updateTeamMembers(data)
  }
)

const deleteTeamMemberStep = createStep(
  "delete-team-member",
  async (id: string, { container }) => {
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.softDeleteTeamMembers(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: ContentModuleService = container.resolve(CONTENT_MODULE)
    await service.restoreTeamMembers(id)
  }
)

export const createTeamMemberWorkflow = createWorkflow(
  "create-team-member",
  (input: TeamMemberInput) => new WorkflowResponse(createTeamMemberStep(input))
)

export const updateTeamMemberWorkflow = createWorkflow(
  "update-team-member",
  (input: { id: string; data: TeamMemberInput }) => new WorkflowResponse(updateTeamMemberStep(input))
)

export const deleteTeamMemberWorkflow = createWorkflow(
  "delete-team-member",
  (id: string) => new WorkflowResponse(deleteTeamMemberStep(id))
)
