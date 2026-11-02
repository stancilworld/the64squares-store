import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { staffFor } from "../../staff-guard"

// GET /admin/dashboard: the numbers for the admin's Dashboard page. Each section is only
// included when the signed-in person may see it (Settings → Staff & permissions).

export const LOW_STOCK_AT = 5

// Midnight today in India, as a Date.
const startOfTodayIST = () => {
  const offset = 330 * 60_000
  const now = new Date(Date.now() + offset)
  now.setUTCHours(0, 0, 0, 0)
  return new Date(now.getTime() - offset)
}

type Row = Record<string, any>

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const staff = await staffFor(req, req.auth_context.actor_id)
  const can = (p: string) => staff.role === "admin" || staff.permissions.includes(p)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const out: Record<string, unknown> = { role: staff.role, permissions: staff.permissions, low_stock_at: LOW_STOCK_AT }

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      req.scope.resolve("logger").warn(`Dashboard: ${(e as Error).message}`)
      return fallback
    }
  }

  const jobs: Promise<void>[] = []

  if (can("orders.view")) {
    jobs.push(
      safe(async () => {
        const since = new Date(Date.now() - 30 * 86_400_000)
        const { data } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "display_id",
            "created_at",
            "status",
            "email",
            "currency_code",
            "total",
            "shipping_address.first_name",
            "shipping_address.last_name",
            "shipping_address.city",
            "fulfillments.id",
            "fulfillments.canceled_at",
          ],
          filters: { created_at: { $gte: since } } as Row,
        })
        const orders = (data as Row[]).filter((o) => o.status !== "draft")
        const today = startOfTodayIST().getTime()
        const live = orders.filter((o) => o.status !== "canceled")
        const todays = live.filter((o) => new Date(o.created_at).getTime() >= today)
        const toPack = live.filter(
          (o) =>
            o.status === "pending" && !(o.fulfillments ?? []).some((f: Row) => f && !f.canceled_at)
        )
        const brief = (o: Row) => ({
          id: o.id,
          display_id: o.display_id,
          created_at: o.created_at,
          email: o.email,
          name: [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(" "),
          city: o.shipping_address?.city ?? null,
          total: Number(o.total ?? 0),
          currency_code: o.currency_code,
          status: o.status,
        })
        const byNewest = (a: Row, b: Row) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        out.orders = {
          today_count: todays.length,
          today_total: todays.reduce((s, o) => s + Number(o.total ?? 0), 0),
          last30_count: live.length,
          last30_total: live.reduce((s, o) => s + Number(o.total ?? 0), 0),
          to_pack_count: toPack.length,
          to_pack: toPack.sort(byNewest).slice(0, 5).map(brief),
          recent: [...orders].sort(byNewest).slice(0, 5).map(brief),
          currency_code: orders[0]?.currency_code ?? "inr",
        }
      }, undefined)
    )
  }

  // Stock is useful to anyone who can see or edit products.
  if (can("inventory.edit") || can("products.edit")) {
    jobs.push(
      safe(async () => {
        const { data } = await query.graph({
          entity: "product_variant",
          fields: [
            "id",
            "title",
            "manage_inventory",
            "product.id",
            "product.title",
            "product.thumbnail",
            "inventory_items.inventory.location_levels.stocked_quantity",
            "inventory_items.inventory.location_levels.reserved_quantity",
          ],
        })
        const low = (data as Row[])
          .filter((v) => v.manage_inventory && v.product)
          .map((v) => {
            const levels = (v.inventory_items ?? []).flatMap((i: Row) => i?.inventory?.location_levels ?? [])
            const available = levels.reduce(
              (s: number, l: Row) => s + Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0),
              0
            )
            return {
              variant_id: v.id,
              variant_title: v.title,
              product_id: v.product.id,
              product_title: v.product.title,
              thumbnail: v.product.thumbnail ?? null,
              available,
            }
          })
          .filter((v) => v.available <= LOW_STOCK_AT)
          .sort((a, b) => a.available - b.available)
        out.stock = { low_count: low.length, out_count: low.filter((v) => v.available <= 0).length, low: low.slice(0, 6) }
      }, undefined)
    )
  }

  if (can("content.blog")) {
    jobs.push(
      safe(async () => {
        const { data } = await query.graph({
          entity: "post",
          fields: ["id", "title", "status", "updated_at"],
          filters: { status: "draft" } as Row,
        })
        const drafts = (data as Row[]).sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        out.blog = { draft_count: drafts.length, drafts: drafts.slice(0, 4).map((p) => ({ id: p.id, title: p.title })) }
      }, undefined)
    )
  }

  if (can("subscribers.view")) {
    jobs.push(
      safe(async () => {
        const { data } = await query.graph({ entity: "subscriber", fields: ["id", "created_at"] })
        const week = Date.now() - 7 * 86_400_000
        out.subscribers = {
          total: data.length,
          this_week: (data as Row[]).filter((s) => new Date(s.created_at).getTime() >= week).length,
        }
      }, undefined)
    )
  }

  await Promise.all(jobs)
  res.set("Cache-Control", "no-store")
  res.json(out)
}
