import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ACTIVITY_MODULE } from "../modules/activity"
import type ActivityModuleService from "../modules/activity/service"

// Activity log (Settings → Activity log): after each successful change in the admin, and each
// admin sign-in attempt, one plain-language line is saved: who, what, when, from where.
// Only the address of the request is used, never what was typed (no passwords or keys).

type Described = { action: string; area: string; target_type?: string; target_id?: string }

// Requests that change nothing worth logging (or are logged elsewhere).
const IGNORE = [
  /^\/uploads(\/|$)/,
  /^\/views(\/|$)/,
  /^\/layouts(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/feature-flags(\/|$)/,
  /^\/staff\/me$/,
  /^\/service-keys\/check$/,
  /^\/search(\/|$)/,
  /^\/activity(\/|$)/,
  /^\/mailbox\/sync$/,
  /^\/chatbot\/try$/,
]

const verb = (method: string, hasId: boolean) =>
  method === "DELETE" ? "Deleted" : hasId ? "Changed" : "Created"

const one = (word: string) => word.replace(/ies$/, "y").replace(/s$/, "")

// Turns an admin request into a sentence. `path` is without /admin.
export const describe = (method: string, path: string, body: Record<string, unknown> = {}): Described | null => {
  if (IGNORE.some((re) => re.test(path))) return null
  const seg = path.split("/").filter(Boolean)
  const [root, id, sub, subId, sub2] = seg
  const hasId = !!id && !["batch", "import", "imports", "export"].includes(id)
  const withTarget = (d: Described, type: string, tid = id): Described => (tid ? { ...d, target_type: type, target_id: tid } : d)
  const priceChange = JSON.stringify(body).includes('"prices"')

  switch (root) {
    case "products": {
      if (id === "import" || id === "imports") return { action: "Imported products", area: "Products" }
      if (id === "export") return { action: "Exported products", area: "Products" }
      if (sub === "variants" && subId && sub2 === "images") return withTarget({ action: "Changed colour photos", area: "Products" }, "product")
      if (sub === "variants") {
        return withTarget({ action: priceChange ? "Changed prices" : method === "DELETE" ? "Deleted a version" : "Changed versions", area: "Products" }, "product")
      }
      if (sub === "options") return withTarget({ action: "Changed colours or materials", area: "Products" }, "product")
      if (sub === "images" || sub === "media") return withTarget({ action: "Changed photos", area: "Products" }, "product")
      return withTarget({ action: `${verb(method, hasId)} product`, area: "Products" }, "product")
    }
    case "stancil-products":
      return withTarget({ action: id ? "Saved product (simple form)" : "Created product (simple form)", area: "Products" }, "product")
    case "shop-order":
      return { action: "Changed shop order or badges", area: "Products" }
    case "product-variants":
      return { action: "Changed versions", area: "Products" }
    case "inventory-items":
    case "reservations":
      return { action: root === "reservations" ? "Changed reservations" : "Updated stock", area: "Products" }
    case "product-categories":
    case "collections":
    case "product-tags":
    case "product-types":
    case "product-options":
      return { action: `${verb(method, hasId)} ${one(root.replace("product-", "").replace("-", " "))}`, area: "Products" }
    case "price-lists":
    case "price-preferences":
      return { action: "Changed sale prices", area: "Discounts" }
    case "promotions":
    case "campaigns":
      return { action: `${verb(method, hasId)} ${one(root) === "promotion" ? "discount" : "campaign"}`, area: "Discounts" }
    case "orders": {
      if (id === "export") return { action: "Exported orders", area: "Orders" }
      const t = (action: string) => withTarget({ action, area: "Orders" }, "order")
      if (sub === "cancel") return t("Cancelled order")
      if (sub === "archive") return t("Archived order")
      if (sub === "complete") return t("Completed order")
      if (sub === "fulfillments" && subId && sub2 === "shipments") return t("Marked order as shipped")
      if (sub === "fulfillments" && subId && sub2 === "mark-as-delivered") return t("Marked order as delivered")
      if (sub === "fulfillments" && subId && sub2 === "cancel") return t("Cancelled packing")
      if (sub === "fulfillments") return t("Packed order")
      return t("Changed order")
    }
    case "payments":
      if (sub === "capture") return { action: "Marked payment as paid", area: "Orders" }
      if (sub === "refund") return { action: "Refunded payment", area: "Orders" }
      return { action: "Changed payment", area: "Orders" }
    case "payment-collections":
      return { action: sub === "mark-as-paid" ? "Marked order as paid" : "Changed payment", area: "Orders" }
    case "invoices":
      return withTarget({ action: "Created invoice", area: "Orders" }, "order")
    case "returns":
    case "claims":
    case "exchanges":
    case "order-edits":
      return { action: `Handled ${root === "order-edits" ? "order edit" : one(root)}`, area: "Orders" }
    case "draft-orders":
      return { action: `${verb(method, hasId)} draft order`, area: "Orders" }
    case "fulfillments":
      return { action: sub === "shipment" ? "Marked order as shipped" : "Changed packing", area: "Orders" }
    case "customers":
      return withTarget({ action: `${verb(method, hasId)} customer`, area: "Customers" }, "customer")
    case "customer-groups":
      return { action: `${verb(method, hasId)} customer group`, area: "Customers" }
    case "subscribers":
      return { action: "Changed newsletter subscribers", area: "Customers" }
    case "content-blocks": {
      const area = "Website"
      if (method === "DELETE") return { action: "Deleted website content", area }
      if (body.draft && body.publish_at) return { action: "Scheduled a website change", area }
      if (body.draft) return { action: "Saved a website draft", area }
      if (body.draft === null && !("title" in body) && !("is_active" in body)) return { action: "Discarded a website draft", area }
      return { action: "Published website content", area }
    }
    case "mailbox":
      if (id === "send") return { action: body.reply_to_id ? "Replied to an email" : body.forward_id ? "Forwarded an email" : "Sent an email", area: "Customers" }
      if (id === "actions") {
        // Reading, starring and the like aren't worth a line; deleting and answering are.
        const n = Array.isArray(body.ids) ? body.ids.length : 1
        const what = `${n} email conversation${n === 1 ? "" : "s"}`
        if (body.action === "delete") return { action: `Deleted ${what}`, area: "Customers" }
        if (body.action === "done") return { action: `Marked ${what} as answered`, area: "Customers" }
        return null
      }
      if (!("note" in body)) return null
      return { action: "Wrote a note on an email conversation", area: "Customers" }
    case "chatbot":
      if (id === "chats") return { action: "Deleted a chat", area: "Website" }
      return { action: "Changed the chat bot", area: "Website" }
    case "contact-page":
      return { action: "Changed the Contact page", area: "Website" }
    case "contact-messages":
      return withTarget({ action: method === "DELETE" ? "Deleted a contact message" : "Updated a contact message", area: "Customers" }, "contact_message")
    case "site-navigation":
      return { action: "Changed menu, footer or announcement bar", area: "Website" }
    case "team-members":
      return { action: `${verb(method, hasId)} team face`, area: "Website" }
    case "pages":
      return { action: `${verb(method, hasId)} help page`, area: "Website" }
    case "posts":
      return {
        action: body.status === "published" ? "Published blog post" : `${verb(method, hasId)} blog post`,
        area: "Website",
      }
    case "staff":
      return { action: id === "defaults" ? "Changed default moderator permissions" : "Changed staff role or permissions", area: "Staff" }
    case "invites":
      return { action: method === "DELETE" ? "Cancelled staff invite" : "Invited staff", area: "Staff" }
    case "users":
      return { action: method === "DELETE" ? "Removed staff member" : "Changed staff profile", area: "Staff" }
    case "api-keys":
      return { action: "Changed API keys", area: "Settings" }
    case "service-keys":
      return { action: "Changed payment or email keys", area: "Settings" }
    case "checkout-settings":
      return { action: "Changed payments & delivery settings", area: "Settings" }
    case "invoice-settings":
      return { action: "Changed invoice settings", area: "Settings" }
    case "upload-limits":
      return { action: "Changed upload limits", area: "Settings" }
    default:
      return { action: `${verb(method, hasId)} ${(root ?? "setting").replace(/-/g, " ")}`, area: "Settings" }
  }
}

// The visitor's address as seen by nginx (X-Real-IP). The first X-Forwarded-For entry can be
// faked by the visitor, so only the last one (added by nginx) is used as a fallback.
export const ipOf = (req: MedusaRequest) => {
  const real = String(req.headers["x-real-ip"] ?? "").trim()
  if (real) return real
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return fwd[fwd.length - 1] || req.ip || null
}

const names = new Map<string, { name: string; at: number }>()
const nameOf = async (req: MedusaRequest, userId: string) => {
  const hit = names.get(userId)
  if (hit && Date.now() - hit.at < 60_000) return hit.name
  try {
    const u = await req.scope.resolve(Modules.USER).retrieveUser(userId)
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email
    names.set(userId, { name, at: Date.now() })
    return name
  } catch {
    return null
  }
}

const save = (req: MedusaRequest, entry: Record<string, unknown>) => {
  try {
    const activity: ActivityModuleService = req.scope.resolve(ACTIVITY_MODULE)
    activity.createActivityEntries(entry as never).catch(() => {})
  } catch {
    // The log must never break the admin.
  }
}

// Middleware for /admin/*: records successful changes once the response is sent.
export function activityRecorder(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const method = req.method.toUpperCase()
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next()
  }
  const path = (req.originalUrl.split("?")[0] || "").replace(/^\/admin/, "") || "/"
  const described = describe(method, path, (req.body ?? {}) as Record<string, unknown>)
  if (!described) {
    return next()
  }
  res.on("finish", () => {
    if (res.statusCode >= 400) return
    const actorId = (req as unknown as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? null
    const run = async () =>
      save(req, {
        ...described,
        actor_id: actorId,
        actor_name: actorId ? await nameOf(req, actorId) : null,
        method,
        path: `/admin${path}`,
        status: res.statusCode,
        ip: ipOf(req),
      })
    run().catch(() => {})
  })
  next()
}

// Middleware for admin sign-in (/auth/user/emailpass): records success and failure.
export function signInRecorder(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (req.method.toUpperCase() !== "POST") {
    return next()
  }
  const email = String(((req.body ?? {}) as { email?: unknown }).email ?? "").trim().toLowerCase().slice(0, 120)
  res.on("finish", () => {
    const ok = res.statusCode < 400
    save(req, {
      action: ok ? "Signed in" : "Failed sign-in (wrong email or password)",
      area: "Sign-in",
      actor_id: null,
      actor_name: email || null,
      method: "POST",
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ip: ipOf(req),
    })
  })
  next()
}
