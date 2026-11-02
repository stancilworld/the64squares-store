import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { BLOG_MODULE } from "../modules/blog"
import BlogModuleService from "../modules/blog/service"

export type PostInput = {
  title?: string
  handle?: string
  excerpt?: string | null
  body?: string
  cover_url?: string | null
  thumbnail_url?: string | null
  author?: string
  status?: "draft" | "published"
  published_at?: string | Date | null
}

// A post published for the first time gets today's date unless one was chosen.
const withPublishDate = (data: PostInput, current?: { published_at?: Date | null }) =>
  data.status === "published" && !data.published_at && !current?.published_at
    ? { ...data, published_at: new Date() }
    : data

const createPostStep = createStep(
  "create-post",
  async (input: PostInput, { container }) => {
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    const post = await service.createPosts(withPublishDate(input) as any)
    return new StepResponse(post, post.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    await service.deletePosts(id)
  }
)

const updatePostStep = createStep(
  "update-post",
  async (input: { id: string; data: PostInput }, { container }) => {
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    const previous = await service.retrievePost(input.id)
    const post = await service.updatePosts({
      id: input.id,
      ...withPublishDate(input.data, previous),
    } as any)
    return new StepResponse(post, previous)
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updatePosts(data)
  }
)

const deletePostStep = createStep(
  "delete-post",
  async (id: string, { container }) => {
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    await service.softDeletePosts(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service: BlogModuleService = container.resolve(BLOG_MODULE)
    await service.restorePosts(id)
  }
)

export const createPostWorkflow = createWorkflow(
  "create-post",
  (input: PostInput) => {
    return new WorkflowResponse(createPostStep(input))
  }
)

export const updatePostWorkflow = createWorkflow(
  "update-post",
  (input: { id: string; data: PostInput }) => {
    return new WorkflowResponse(updatePostStep(input))
  }
)

export const deletePostWorkflow = createWorkflow(
  "delete-post",
  (id: string) => {
    return new WorkflowResponse(deletePostStep(id))
  }
)
