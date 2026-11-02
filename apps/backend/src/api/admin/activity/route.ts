import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ACTIVITY_MODULE } from "../../../modules/activity"
import type ActivityModuleService from "../../../modules/activity/service"

type Row = Record<string, any>

// GET /admin/activity?area=&person=&offset=&limit=: the activity log, newest first, with
// order numbers / product names / customer emails filled in. Admin only.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const activity: ActivityModuleService = req.scope.resolve(ACTIVITY_MODULE)
  const q = req.query as Record<string, string | undefined>
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const filters: Record<string, unknown> = {}
  if (q.area) filters.area = q.area
  if (q.person) filters.actor_name = q.person
  const [entries, count] = await activity.listAndCountActivityEntries(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Names for what was changed.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const ids = (type: string) => [...new Set((entries as Row[]).filter((e) => e.target_type === type).map((e) => e.target_id))]
  const lookup = async (entity: string, list: string[], fields: string[], label: (r: Row) => string) => {
    if (!list.length) return new Map<string, string>()
    const { data } = await query.graph({ entity, fields: ["id", ...fields], filters: { id: list } }).catch(() => ({ data: [] }))
    return new Map((data as Row[]).map((r) => [r.id as string, label(r)]))
  }
  const [orders, products, customers] = await Promise.all([
    lookup("order", ids("order"), ["display_id"], (r) => `Order #${r.display_id}`),
    lookup("product", ids("product"), ["title"], (r) => r.title),
    lookup("customer", ids("customer"), ["email"], (r) => r.email),
  ])
  const label = (e: Row) =>
    e.target_type === "order" ? orders.get(e.target_id) : e.target_type === "product" ? products.get(e.target_id) : e.target_type === "customer" ? customers.get(e.target_id) : null
  const link = (e: Row) =>
    !e.target_id
      ? null
      : e.target_type === "order"
        ? `/orders/${e.target_id}`
        : e.target_type === "product"
          ? `/products/${e.target_id}`
          : e.target_type === "customer"
            ? `/customers/${e.target_id}`
            : null

  // People and areas for the filters.
  const { data: people } = await query
    .graph({ entity: "activity_entry", fields: ["actor_name"] })
    .catch(() => ({ data: [] as Row[] }))
  res.json({
    entries: (entries as Row[]).map((e) => ({
      id: e.id,
      at: e.created_at,
      who: e.actor_name,
      action: e.action,
      area: e.area,
      target: label(e) ?? null,
      link: link(e) && label(e) ? link(e) : null,
      ip: e.ip,
      failed: e.area === "Sign-in" && e.status >= 400,
    })),
    count,
    offset,
    limit,
    people: [...new Set((people as Row[]).map((p) => p.actor_name).filter(Boolean))].sort(),
    areas: ["Orders", "Products", "Customers", "Discounts", "Website", "Staff", "Settings", "Sign-in"],
  })
}
