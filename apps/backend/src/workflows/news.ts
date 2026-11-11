import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { NEWS_MODULE } from "../modules/news"
import NewsModuleService from "../modules/news/service"
import { cleanArticleHtml } from "../lib/news-html"

export type NewsInput = {
  title?: string
  handle?: string
  excerpt?: string | null
  body_html?: string
  cover_url?: string | null
  topic?: string
  author?: string
  featured?: boolean
  status?: "draft" | "published"
  published_at?: string | Date | null
}

// Cleans the article's HTML, and gives an article published for the first time today's date
// unless one was chosen.
const prepare = (data: NewsInput, current?: { published_at?: Date | null }) => {
  const out: NewsInput = { ...data }
  if (typeof out.body_html === "string") out.body_html = cleanArticleHtml(out.body_html)
  if (typeof out.topic === "string") out.topic = out.topic.trim() || "News"
  if (out.status === "published" && !out.published_at && !current?.published_at) out.published_at = new Date()
  return out
}

const createNewsStep = createStep(
  "create-news",
  async (input: NewsInput, { container }) => {
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    const article = await service.createNewsArticles(prepare(input) as any)
    return new StepResponse(article, article.id)
  },
  async (id, { container }) => {
    if (!id) return
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    await service.deleteNewsArticles(id)
  }
)

const updateNewsStep = createStep(
  "update-news",
  async (input: { id: string; data: NewsInput }, { container }) => {
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    const previous = await service.retrieveNewsArticle(input.id)
    const article = await service.updateNewsArticles({ id: input.id, ...prepare(input.data, previous) } as any)
    return new StepResponse(article, previous)
  },
  async (previous, { container }) => {
    if (!previous) return
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    const { created_at, updated_at, deleted_at, ...data } = previous as any
    await service.updateNewsArticles(data)
  }
)

const deleteNewsStep = createStep(
  "delete-news",
  async (id: string, { container }) => {
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    await service.softDeleteNewsArticles(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) return
    const service: NewsModuleService = container.resolve(NEWS_MODULE)
    await service.restoreNewsArticles(id)
  }
)

export const createNewsWorkflow = createWorkflow("create-news", (input: NewsInput) => {
  return new WorkflowResponse(createNewsStep(input))
})

export const updateNewsWorkflow = createWorkflow("update-news", (input: { id: string; data: NewsInput }) => {
  return new WorkflowResponse(updateNewsStep(input))
})

export const deleteNewsWorkflow = createWorkflow("delete-news", (id: string) => {
  return new WorkflowResponse(deleteNewsStep(id))
})
