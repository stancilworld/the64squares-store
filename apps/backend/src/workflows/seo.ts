import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SEO_MODULE } from "../modules/seo"
import type SeoModuleService from "../modules/seo/service"

// SEO settings for pages, redirects, and the log of addresses that weren't found.

export type SeoMetaInput = {
  target_type: string
  target_key: string
  title?: string | null
  description?: string | null
  image_url?: string | null
  keyword?: string | null
  noindex?: boolean
}

type Undo = { id: string; previous: Record<string, unknown> | null }

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() || null : v)

const upsertSeoMetaStep = createStep(
  "upsert-seo-meta",
  async (input: SeoMetaInput, { container }) => {
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    const [existing] = await seo.listSeoMetas({ target_type: input.target_type, target_key: input.target_key })
    const data = {
      ...(input.title !== undefined ? { title: clean(input.title) } : {}),
      ...(input.description !== undefined ? { description: clean(input.description) } : {}),
      ...(input.image_url !== undefined ? { image_url: clean(input.image_url) } : {}),
      ...(input.keyword !== undefined ? { keyword: clean(input.keyword) } : {}),
      ...(input.noindex !== undefined ? { noindex: input.noindex } : {}),
    }
    if (existing) {
      const updated = await seo.updateSeoMetas({ id: existing.id, ...data })
      return new StepResponse(updated, { id: existing.id, previous: existing } as Undo)
    }
    const created = await seo.createSeoMetas({ target_type: input.target_type, target_key: input.target_key, ...data })
    return new StepResponse(created, { id: created.id, previous: null } as Undo)
  },
  async (undo, { container }) => {
    if (!undo) return
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    if (undo.previous) {
      const { created_at, updated_at, deleted_at, ...prev } = undo.previous
      await seo.updateSeoMetas(prev as never)
    } else await seo.deleteSeoMetas(undo.id)
  }
)

export const upsertSeoMetaWorkflow = createWorkflow("upsert-seo-meta", (input: SeoMetaInput) => {
  return new WorkflowResponse(upsertSeoMetaStep(input))
})

// Paths are stored without a trailing slash or query, lower-cased.
export const normalisePath = (p: string) => {
  let path = p.trim()
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname
  } catch {}
  path = path.split("?")[0].split("#")[0]
  if (!path.startsWith("/")) path = `/${path}`
  path = path.replace(/\/+$/, "") || "/"
  return path.toLowerCase()
}

export type RedirectInput = { from_path: string; to_path: string; permanent?: boolean }

const saveRedirectStep = createStep(
  "save-redirect",
  async (input: RedirectInput & { id?: string }, { container }) => {
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    const from = normalisePath(input.from_path)
    const to = input.to_path.trim()
    if (from === "/") throw new MedusaError(MedusaError.Types.INVALID_DATA, "The home page can't be redirected.")
    if (normalisePath(to) === from) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A page can't redirect to itself.")
    // A chain (A → B while B → C) would make visitors hop twice; and B → A would loop forever.
    const [loop] = await seo.listRedirects({ from_path: normalisePath(to) })
    if (loop && normalisePath(loop.to_path) === from) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That would send visitors round in a loop.")
    const [clash] = await seo.listRedirects({ from_path: from })
    if (clash && clash.id !== input.id) throw new MedusaError(MedusaError.Types.INVALID_DATA, `${from} already redirects to ${clash.to_path}.`)
    if (input.id) {
      const [previous] = await seo.listRedirects({ id: input.id })
      const updated = await seo.updateRedirects({ id: input.id, from_path: from, to_path: to, permanent: input.permanent ?? true })
      return new StepResponse(updated, { id: input.id, previous } as Undo)
    }
    const created = await seo.createRedirects({ from_path: from, to_path: to, permanent: input.permanent ?? true })
    // Once redirected, it no longer needs to show as "not found".
    const gone = await seo.listNotFounds({ path: from })
    if (gone.length) await seo.deleteNotFounds(gone.map((g) => g.id))
    return new StepResponse(created, { id: created.id, previous: null } as Undo)
  },
  async (undo, { container }) => {
    if (!undo) return
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    if (undo.previous) {
      const { created_at, updated_at, deleted_at, ...prev } = undo.previous
      await seo.updateRedirects(prev as never)
    } else await seo.deleteRedirects(undo.id)
  }
)

export const saveRedirectWorkflow = createWorkflow("save-redirect", (input: RedirectInput & { id?: string }) => {
  return new WorkflowResponse(saveRedirectStep(input))
})

const deleteRedirectStep = createStep(
  "delete-redirect",
  async (id: string, { container }) => {
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    await seo.softDeleteRedirects(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (!id) return
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    await seo.restoreRedirects(id)
  }
)
export const deleteRedirectWorkflow = createWorkflow("delete-redirect", (id: string) => {
  return new WorkflowResponse(deleteRedirectStep(id))
})

// Counts a redirect being used (the website reports it; best effort, no undo needed).
const countRedirectStep = createStep("count-redirect", async (from: string, { container }) => {
  const seo: SeoModuleService = container.resolve(SEO_MODULE)
  const [r] = await seo.listRedirects({ from_path: normalisePath(from) })
  if (r) await seo.updateRedirects({ id: r.id, hits: (r.hits ?? 0) + 1, last_hit_at: new Date() })
  return new StepResponse(!!r)
})
export const countRedirectWorkflow = createWorkflow("count-redirect", (from: string) => {
  return new WorkflowResponse(countRedirectStep(from))
})

// Logs an address that wasn't found. Ignores obvious bot probes; keeps at most 2,000 paths.
const BOT_PROBES = /\.(php|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|ini|xml\.gz)$|wp-|\/\.|xmlrpc|phpmyadmin|cgi-bin/i
const logNotFoundStep = createStep("log-not-found", async (input: { path: string; referrer?: string | null }, { container }) => {
  const seo: SeoModuleService = container.resolve(SEO_MODULE)
  const path = normalisePath(input.path)
  if (path.length > 300 || BOT_PROBES.test(path)) return new StepResponse(false)
  const [row] = await seo.listNotFounds({ path })
  const referrer = input.referrer?.slice(0, 300) || null
  if (row) {
    await seo.updateNotFounds({ id: row.id, hits: (row.hits ?? 0) + 1, last_seen_at: new Date(), ...(referrer ? { referrer } : {}) })
    return new StepResponse(true)
  }
  const [, count] = await seo.listAndCountNotFounds({}, { take: 1 })
  if (count >= 2000) return new StepResponse(false)
  await seo.createNotFounds({ path, referrer, hits: 1, last_seen_at: new Date() })
  return new StepResponse(true)
})
export const logNotFoundWorkflow = createWorkflow("log-not-found", (input: { path: string; referrer?: string | null }) => {
  return new WorkflowResponse(logNotFoundStep(input))
})

const clearNotFoundStep = createStep(
  "clear-not-found",
  async (ids: string[], { container }) => {
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    await seo.softDeleteNotFounds(ids)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) return
    const seo: SeoModuleService = container.resolve(SEO_MODULE)
    await seo.restoreNotFounds(ids)
  }
)
export const clearNotFoundWorkflow = createWorkflow("clear-not-found", (ids: string[]) => {
  return new WorkflowResponse(clearNotFoundStep(ids))
})
