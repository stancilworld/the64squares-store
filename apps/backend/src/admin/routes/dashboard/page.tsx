import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowUpRightOnBox,
  ChartBar,
  House,
  Newspaper,
  Plus,
  ReceiptPercent,
  Users,
} from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"
import { useMe } from "../../lib/staff"

type OrderBrief = {
  id: string
  display_id: number
  created_at: string
  email: string | null
  name: string
  city: string | null
  total: number
  currency_code: string
  status: string
}
type Dashboard = {
  low_stock_at: number
  orders?: {
    today_count: number
    today_total: number
    last30_count: number
    last30_total: number
    to_pack_count: number
    to_pack: OrderBrief[]
    recent: OrderBrief[]
    currency_code: string
  }
  stock?: {
    low_count: number
    out_count: number
    low: { variant_id: string; variant_title: string; product_id: string; product_title: string; thumbnail: string | null; available: number }[]
  }
  blog?: { draft_count: number; drafts: { id: string; title: string }[] }
  subscribers?: { total: number; this_week: number }
}

const money = (amount: number, currency = "inr") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(
    amount
  )

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }))
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

const Tile = ({ label, value, hint, to, tone }: { label: string; value: ReactNode; hint?: string; to: string; tone?: "warn" | "ok" }) => (
  <Link data-keep to={to} className="block">
    <Container className="flex h-full flex-col gap-y-1 px-5 py-4 transition-colors hover:bg-ui-bg-base-hover">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <span className={`txt-compact-xlarge-plus ${tone === "warn" ? "text-ui-tag-orange-text" : "text-ui-fg-base"}`}>
        {value}
      </span>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </Container>
  </Link>
)

const Card = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <Container className="divide-y p-0">
    <div className="flex items-center justify-between px-5 py-3">
      <Heading level="h2">{title}</Heading>
      {action}
    </div>
    {children}
  </Container>
)

const Empty = ({ children }: { children: ReactNode }) => (
  <Text size="small" className="px-5 py-4 text-ui-fg-subtle">
    {children}
  </Text>
)

const OrderRows = ({ orders }: { orders: OrderBrief[] }) => (
  <div className="divide-y">
    {orders.map((o) => (
      <Link key={o.id} data-keep to={`/orders/${o.id}`} className="flex items-center justify-between gap-x-3 px-5 py-2.5 hover:bg-ui-bg-base-hover">
        <div className="flex min-w-0 flex-col">
          <Text size="small" weight="plus">
            #{o.display_id} · {o.name || o.email || "Customer"}
          </Text>
          <Text size="xsmall" className="truncate text-ui-fg-subtle">
            {when(o.created_at)}
            {o.city ? ` · ${o.city}` : ""}
          </Text>
        </div>
        <Text size="small" className="shrink-0">
          {money(o.total, o.currency_code)}
        </Text>
      </Link>
    ))}
  </div>
)

const DashboardPage = () => {
  const storeUrl = useStoreUrl()
  const { me, can } = useMe()
  const { data, isLoading } = useQuery({
    queryKey: ["stancil-dashboard"],
    queryFn: () => sdk.client.fetch<Dashboard>("/admin/dashboard"),
    refetchInterval: 60_000,
  })
  const { data: user } = useQuery({
    queryKey: ["users-me-name"],
    queryFn: () => sdk.client.fetch<{ user: { first_name: string | null; email: string } }>("/admin/users/me"),
  })
  const name = user?.user.first_name || ""

  const actions = [
    { label: "Add a product", to: "/product-editor", icon: Plus, show: can("products.edit") },
    { label: "Edit homepage", to: "/website/homepage", icon: House, show: can("content.homepage") },
    { label: "Write a blog post", to: "/website/blog", icon: Newspaper, show: can("content.blog") },
    { label: "Create a discount", to: "/promotions/create", icon: ReceiptPercent, show: can("promotions.manage") },
    { label: "Staff & permissions", to: "/settings/staff", icon: Users, show: me?.role === "admin" },
  ].filter((a) => a.show)

  const o = data?.orders
  const s = data?.stock

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">
            {greeting()}
            {name ? `, ${name}` : ""}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Here's what needs attention in the store today.
          </Text>
        </div>
        {storeUrl && (
          <Button size="small" variant="secondary" asChild>
            <a href={storeUrl} target="_blank" rel="noreferrer">
              <ArrowUpRightOnBox />
              View website
            </a>
          </Button>
        )}
      </Container>

      {isLoading ? (
        <Container className="px-6 py-4">
          <Text size="small">Loading...</Text>
        </Container>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {o && (
              <Tile
                label="Orders today"
                value={o.today_count}
                hint={o.today_count ? money(o.today_total, o.currency_code) : `${o.last30_count} in the last 30 days`}
                to="/orders"
              />
            )}
            {o && (
              <Tile
                label="Waiting to be packed"
                value={o.to_pack_count}
                hint={o.to_pack_count ? "Paid orders not yet shipped" : "All caught up"}
                to="/orders"
                tone={o.to_pack_count ? "warn" : undefined}
              />
            )}
            {s && (
              <Tile
                label="Low on stock"
                value={s.low_count}
                hint={s.out_count ? `${s.out_count} sold out` : `${data!.low_stock_at} or fewer left`}
                to="/inventory"
                tone={s.low_count ? "warn" : undefined}
              />
            )}
            {data?.blog && (
              <Tile
                label="Blog drafts"
                value={data.blog.draft_count}
                hint={data.blog.draft_count ? "Waiting to be published" : "Nothing waiting"}
                to="/website/blog"
              />
            )}
            {data?.subscribers && !data.blog && (
              <Tile label="Newsletter sign-ups this week" value={data.subscribers.this_week} hint={`${data.subscribers.total} in total`} to="/subscribers" />
            )}
          </div>

          {actions.length > 0 && (
            <Container className="flex flex-wrap items-center gap-2 px-5 py-3">
              <Text size="small" weight="plus" className="me-2">
                Quick actions
              </Text>
              {actions.map((a) => (
                <Button key={a.to} size="small" variant="secondary" asChild>
                  <Link data-keep to={a.to}>
                    <a.icon />
                    {a.label}
                  </Link>
                </Button>
              ))}
            </Container>
          )}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {o && (
              <Card
                title="Waiting to be packed"
                action={
                  <Button size="small" variant="transparent" asChild>
                    <Link data-keep to="/orders">All orders</Link>
                  </Button>
                }
              >
                {o.to_pack.length ? <OrderRows orders={o.to_pack} /> : <Empty>Nothing to pack right now.</Empty>}
              </Card>
            )}
            {s && (
              <Card
                title="Low on stock"
                action={
                  <Button size="small" variant="transparent" asChild>
                    <Link data-keep to="/inventory">Stock</Link>
                  </Button>
                }
              >
                {s.low.length ? (
                  <div className="divide-y">
                    {s.low.map((v) => (
                      <Link
                        data-keep
                        key={v.variant_id}
                        to={`/products/${v.product_id}`}
                        className="flex items-center gap-x-3 px-5 py-2.5 hover:bg-ui-bg-base-hover"
                      >
                        <span className="size-8 shrink-0 overflow-hidden rounded-md bg-ui-bg-component shadow-borders-base">
                          {v.thumbnail && <img src={v.thumbnail} alt="" className="size-full object-cover" />}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <Text size="small" weight="plus" className="truncate">
                            {v.product_title}
                          </Text>
                          <Text size="xsmall" className="truncate text-ui-fg-subtle">
                            {v.variant_title}
                          </Text>
                        </div>
                        <Badge size="2xsmall" color={v.available <= 0 ? "red" : "orange"}>
                          {v.available <= 0 ? "Sold out" : `${v.available} left`}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Empty>Every product has more than {data!.low_stock_at} in stock.</Empty>
                )}
              </Card>
            )}
            {o && (
              <Card title="Latest orders">
                {o.recent.length ? <OrderRows orders={o.recent} /> : <Empty>No orders yet. They'll appear here as they come in.</Empty>}
              </Card>
            )}
            {(data?.blog || data?.subscribers) && (
              <Card title="Website">
                <div className="divide-y">
                  {data?.blog?.drafts.map((p) => (
                    <Link key={p.id} data-keep to="/website/blog" className="flex items-center justify-between px-5 py-2.5 hover:bg-ui-bg-base-hover">
                      <Text size="small">{p.title}</Text>
                      <Badge size="2xsmall">Draft</Badge>
                    </Link>
                  ))}
                  {data?.subscribers && (
                    <Link data-keep to="/subscribers" className="flex items-center justify-between px-5 py-2.5 hover:bg-ui-bg-base-hover">
                      <Text size="small">Newsletter sign-ups this week</Text>
                      <Text size="small" weight="plus">
                        {data.subscribers.this_week} <span className="text-ui-fg-subtle">of {data.subscribers.total}</span>
                      </Text>
                    </Link>
                  )}
                  {can("content.homepage") || can("content.about") ? (
                    <Link data-keep to="/website" className="flex items-center justify-between px-5 py-2.5 hover:bg-ui-bg-base-hover">
                      <Text size="small">Edit homepage, About us, characters and more</Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        Website →
                      </Text>
                    </Link>
                  ) : null}
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Dashboard",
  icon: ChartBar,
  rank: 0,
})

export default DashboardPage
