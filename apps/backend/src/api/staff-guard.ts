import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  DEFAULT_PERMISSIONS,
  DEFAULTS_SETTING_KEY,
  needFor,
  permissionLabel,
  staffOf,
  touchesPrices,
} from "../lib/permissions"
import { BLOG_MODULE } from "../modules/blog"
import BlogModuleService from "../modules/blog/service"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

type Staff = ReturnType<typeof staffOf>

// Short cache so every admin request does not reload the user; cleared when the admin
// changes someone's role or toggles.
const CACHE_MS = 10_000
const cache = new Map<string, { at: number; staff: Staff }>()
export const clearStaffCache = () => cache.clear()

export const loadDefaults = async (content: ContentModuleService): Promise<string[]> => {
  const saved = await content.getSettingValue(DEFAULTS_SETTING_KEY)
  const list = saved?.permissions
  return Array.isArray(list) ? (list as string[]) : DEFAULT_PERMISSIONS
}

export const staffFor = async (req: Pick<MedusaRequest, "scope">, userId: string): Promise<Staff> => {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.staff
  }
  const users = req.scope.resolve(Modules.USER)
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const [user, defaults] = await Promise.all([users.retrieveUser(userId), loadDefaults(content)])
  const staff = staffOf(user, defaults)
  cache.set(userId, { at: Date.now(), staff })
  return staff
}

const deny = (res: MedusaResponse, what: string) =>
  res.status(403).json({
    type: "not_allowed",
    message: `You don't have permission for "${what}". Ask the admin to switch it on for you in Settings → Staff & permissions.`,
  })

// Which permission a change to a content block needs, by the page it belongs to.
const contentNeed = (page: string | undefined, section: string | undefined) => {
  if (page === "home") return "content.homepage"
  if (page === "about") return "content.about"
  if (page === "site" && section === "footer_media") return "content.footer"
  return "settings.branding"
}

/**
 * Checks every admin request against the signed-in person's role. Admins pass; moderators
 * pass only for actions the admin switched on for them.
 */
export async function staffGuard(
  request: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const req = request as AuthenticatedMedusaRequest
  const actorId = req.auth_context?.actor_id
  // Not signed in as staff yet (e.g. accepting an invite): Medusa's own checks apply.
  if (!actorId || req.auth_context?.actor_type !== "user") {
    return next()
  }

  const method = req.method.toUpperCase()
  const path = (req.originalUrl.split("?")[0] || "").replace(/^\/admin/, "") || "/"

  // Everyone may read their own role, and edit their own name.
  if (path === "/staff/me" || path === "/users/me" || (path === `/users/${actorId}` && method === "POST")) {
    return next()
  }

  const staff = await staffFor(req, actorId)
  if (staff.role === "admin") {
    return next()
  }

  let need = needFor(method, path)
  const body = (req.body ?? {}) as Record<string, unknown>
  const write = method !== "GET" && method !== "HEAD"

  // Content blocks: the page decides which toggle applies.
  if (write && /^\/content-blocks(\/|$)/.test(path)) {
    const id = path.split("/")[2]
    if (id) {
      const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
      const [block] = await content.listContentBlocks({ id })
      need = contentNeed(block?.page, block?.section)
    } else {
      need = contentNeed(body.page as string | undefined, body.section as string | undefined)
    }
  }

  // Blog: publishing, editing a live post or deleting needs "Publish blog posts".
  if (write && /^\/posts(\/|$)/.test(path)) {
    const id = path.split("/")[2]
    let live = body.status === "published" || method === "DELETE"
    if (id && !live) {
      const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)
      const [post] = await blog.listPosts({ id })
      live = post?.status === "published"
    }
    if (live && !staff.permissions.includes("content.blog_publish")) {
      return deny(res, permissionLabel("content.blog_publish"))
    }
  }

  if (need === "allow") {
    return next()
  }
  if (need === "admin") {
    return res.status(403).json({
      type: "not_allowed",
      message: "Only the admin can do this.",
    })
  }
  if (!staff.permissions.includes(need)) {
    return deny(res, permissionLabel(need))
  }

  // Product changes that set prices also need "Change prices".
  if (
    write &&
    /^\/(products|product-variants)(\/|$)/.test(path) &&
    touchesPrices(body) &&
    !staff.permissions.includes("products.prices")
  ) {
    return deny(res, permissionLabel("products.prices"))
  }

  return next()
}
