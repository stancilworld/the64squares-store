import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartPie } from "@medusajs/icons"
import { Alert, Button, Container, Copy, Heading, Input, Label, Select, Table, Tabs, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"

// Analytics: visits, sales and where they came from, the path from visit to order, what
// people searched for, and Play. Counted by the store itself from the website's events, so
// it works without Google Analytics (and without cookies: a visit is one browser tab).

type Totals = { visits: number; page_views: number; orders: number; revenue: number; conversion: number; average_order: number; add_to_carts: number; searches: number }
type ShopReport = {
  period: { from: string; to: string; days: number }
  totals: Totals
  previous: Totals
  daily: { day: string; visits: number; orders: number; revenue: number }[]
  sources: { source: string; medium: string; visits: number; orders: number; revenue: number }[]
  campaigns: { campaign: string; source: string; visits: number; orders: number; revenue: number }[]
  funnel: { step: string; count: number }[]
  pages: { page: string; views: number; visits: number }[]
  products: { product_id: string; name: string; views: number; added: number; sold: number; revenue: number }[]
}
type SearchReport = {
  total: number
  empty: number
  terms: { term: string; searches: number; visits: number; results: number | null; empty: number; last_at: string | null }[]
  nothing_found: SearchReport["terms"]
}
type PlayReport =
  | { available: false }
  | {
      available: true
      totals: { started: number; finished: number; rated: number; tournament: number; players: number; avg_moves: number; new_players: number }
      puzzles: { attempts: number; solved: number; players: number }
      daily: { day: string; games: number }[]
      modes: { mode: string; games: number }[]
      speeds: { speed: string; clock: string; games: number }[]
      endings: { reason: string; games: number }[]
    }

const num = (x: number) => x.toLocaleString("en-IN")
const rupees = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const PERIODS = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
]

const useReport = <T,>(kind: string, days: string) =>
  useQuery({ queryKey: ["analytics", kind, days], queryFn: () => sdk.client.fetch<T>(`/admin/analytics/${kind}?days=${days}`), staleTime: 60_000 })

// Every day of the period, with zero for days without any events.
const allDays = <T extends { day: string }>(rows: T[], days: number, empty: Omit<T, "day">): T[] => {
  if (days <= 1) return rows
  const by = new Map(rows.map((r) => [r.day, r]))
  const out: T[] = []
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })
  for (let i = days - 1; i >= 0; i--) {
    const day = fmt.format(new Date(Date.now() - i * 86_400_000))
    out.push(by.get(day) ?? ({ day, ...empty } as T))
  }
  return out
}

function Bars({ values, labels, format, label }: { values: number[]; labels: string[]; format: (x: number) => string; label: string }) {
  const max = Math.max(1, ...values)
  if (!values.length) return null
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-[96px] items-end gap-[2px]">
        {values.map((v, i) => (
          <div key={labels[i]} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div className="w-full rounded-t-[2px] bg-ui-fg-interactive opacity-80 group-hover:opacity-100" style={{ height: `${v ? Math.max(3, (v / max) * 100) : 0}%` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ui-bg-component px-2 py-1 text-[11px] shadow group-hover:block">
              {labels[i]}: {format(v)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ui-fg-muted">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

function Change({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <Text size="xsmall" className="text-ui-fg-muted">No earlier data</Text>
  const d = (now - before) / before
  const up = d >= 0
  const good = invert ? !up : up
  return (
    <Text size="xsmall" className={good ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}>
      {up ? "▲" : "▼"} {pct(Math.abs(d))} vs the period before
    </Text>
  )
}

function Tiles({ items }: { items: { label: string; value: string; now?: number; before?: number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px border-y bg-ui-border-base md:grid-cols-3 xl:grid-cols-6">
      {items.map((t) => (
        <div key={t.label} className="bg-ui-bg-base px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t.label}
          </Text>
          <Text className="mt-1 text-[22px] font-semibold tabular-nums">{t.value}</Text>
          {t.now !== undefined && t.before !== undefined && <Change now={t.now} before={t.before} />}
        </div>
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
      {children}
    </Text>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 pt-5">
      <div className="px-6 pb-2">
        <Text size="small" weight="plus">
          {title}
        </Text>
        {note && (
          <Text size="xsmall" className="text-ui-fg-muted">
            {note}
          </Text>
        )}
      </div>
      {children}
    </div>
  )
}

function Funnel({ steps }: { steps: ShopReport["funnel"] }) {
  const first = steps[0]?.count || 0
  if (!first) return <Empty>No visits in this period yet.</Empty>
  return (
    <ol className="space-y-2 px-6 pb-2">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].count : s.count
        return (
          <li key={s.step} className="grid grid-cols-[160px_1fr_150px] items-center gap-3">
            <Text size="small">{s.step}</Text>
            <div className="h-6 overflow-hidden rounded bg-ui-bg-subtle">
              <div className="h-full rounded bg-ui-fg-interactive opacity-80" style={{ width: `${Math.min(100, (s.count / first) * 100)}%` }} />
            </div>
            <Text size="small" className="tabular-nums">
              {num(s.count)}
              {i > 0 && prev > 0 && <span className="text-ui-fg-muted"> ({pct(Math.min(1, s.count / prev))} of the step above)</span>}
            </Text>
          </li>
        )
      })}
    </ol>
  )
}

function Overview({ days }: { days: string }) {
  const { data, isLoading, error } = useReport<ShopReport>("shop", days)
  const daily = useMemo(() => (data ? allDays(data.daily, data.period.days, { visits: 0, orders: 0, revenue: 0 }) : []), [data])
  if (isLoading) return <Empty>Loading…</Empty>
  if (error) return <Alert variant="error" className="m-6">{(error as Error).message}</Alert>
  if (!data) return null
  const t = data.totals
  const p = data.previous
  return (
    <>
      <Tiles
        items={[
          { label: "Visits", value: num(t.visits), now: t.visits, before: p.visits },
          { label: "Pages viewed", value: num(t.page_views), now: t.page_views, before: p.page_views },
          { label: "Orders", value: num(t.orders), now: t.orders, before: p.orders },
          { label: "Sales", value: rupees(t.revenue), now: t.revenue, before: p.revenue },
          { label: "Visits that ordered", value: pct(t.conversion), now: t.conversion, before: p.conversion },
          { label: "Average order", value: t.orders ? rupees(t.average_order) : "–", now: t.average_order, before: p.average_order },
        ]}
      />
      {daily.length > 1 && (
        <div className="grid gap-6 px-6 pt-5 lg:grid-cols-2">
          <div>
            <Text size="xsmall" className="mb-2 text-ui-fg-subtle">
              Visits per day
            </Text>
            <Bars values={daily.map((d) => d.visits)} labels={daily.map((d) => shortDay(d.day))} format={num} label="Visits per day" />
          </div>
          <div>
            <Text size="xsmall" className="mb-2 text-ui-fg-subtle">
              Sales per day
            </Text>
            <Bars values={daily.map((d) => d.revenue)} labels={daily.map((d) => shortDay(d.day))} format={rupees} label="Sales per day" />
          </div>
        </div>
      )}
      <Section title="From visit to order" note="How many visits reached each step. The last step counts orders.">
        <Funnel steps={data.funnel} />
      </Section>
      <div className="grid gap-2 xl:grid-cols-2">
        <Section title="Products">
          {!data.products.length ? (
            <Empty>No product views yet.</Empty>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Views</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Added to cart</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Sold</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Sales</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.products.map((r) => (
                  <Table.Row key={r.product_id}>
                    <Table.Cell className="max-w-[220px] truncate">
                      <Link to={`/products/${r.product_id}`} className="hover:underline">
                        {r.name || r.product_id}
                      </Link>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{num(r.views)}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{num(r.added)}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{num(r.sold)}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{rupees(r.revenue)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Section>
        <Section title="Most viewed pages">
          {!data.pages.length ? (
            <Empty>No page views yet.</Empty>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Page</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Views</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Visits</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.pages.map((r) => (
                  <Table.Row key={r.page}>
                    <Table.Cell className="max-w-[320px] truncate font-mono text-[12px]">{r.page}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{num(r.views)}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">{num(r.visits)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Section>
      </div>
    </>
  )
}

const SOURCES = ["instagram", "facebook", "whatsapp", "youtube", "google", "newsletter", "x", "linkedin", "partner"]
const MEDIUMS = [
  { value: "social", label: "Social post (free)" },
  { value: "paid_social", label: "Paid social ad" },
  { value: "cpc", label: "Paid search ad" },
  { value: "email", label: "Email" },
  { value: "message", label: "WhatsApp / message" },
  { value: "influencer", label: "Influencer" },
  { value: "qr", label: "QR code / print" },
  { value: "referral", label: "Partner website" },
]
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

type Redirect = { id: string; from_path: string; to_path: string; permanent: boolean; hits: number }

// Campaign links: a page address with tags that say where the visitor came from, so visits
// and sales show up under that campaign here. Optionally a short /go/… link for it.
function LinkBuilder() {
  const store = useStoreUrl() ?? "https://the64squares.in"
  const qc = useQueryClient()
  const [page, setPage] = useState("/")
  const [source, setSource] = useState("instagram")
  const [medium, setMedium] = useState("social")
  const [campaign, setCampaign] = useState("")
  const [content, setContent] = useState("")
  const [short, setShort] = useState("")

  const path = page.trim().startsWith("/") ? page.trim() : `/${page.trim()}`
  const params = new URLSearchParams()
  if (slug(source)) params.set("utm_source", slug(source))
  if (medium) params.set("utm_medium", medium)
  if (slug(campaign)) params.set("utm_campaign", slug(campaign))
  if (slug(content)) params.set("utm_content", slug(content))
  const relative = `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`
  const full = `${store.replace(/\/$/, "")}${relative}`
  const ready = !!slug(source) && !!slug(campaign)

  const links = useQuery({
    queryKey: ["campaign-links"],
    queryFn: () => sdk.client.fetch<{ redirects: Redirect[] }>("/admin/seo/redirects"),
    select: (d) => d.redirects.filter((r) => r.from_path.startsWith("/go/")),
    retry: false,
  })
  const make = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/seo/redirects", { method: "POST", body: { from_path: `/go/${slug(short)}`, to_path: relative, permanent: false } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-links"] })
      toast.success("Short link made", { description: `${store.replace(/\/$/, "")}/go/${slug(short)}` })
      setShort("")
    },
    onError: (e: Error) => toast.error("Could not make the short link", { description: e.message }),
  })

  return (
    <Section title="Make a campaign link" note="Use it in a post, ad, email or QR code. Visits and orders from it appear under Sources and Campaigns.">
      <div className="grid gap-4 px-6 pb-2 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <Label size="small">Page on the website</Label>
          <Input size="small" value={page} onChange={(e) => setPage(e.target.value)} placeholder="/products/walnut-folding-chess-board" />
        </div>
        <div>
          <Label size="small">Where it will be posted</Label>
          <Input size="small" list="utm-sources" value={source} onChange={(e) => setSource(e.target.value)} />
          <datalist id="utm-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <Label size="small">Kind of link</Label>
          <Select size="small" value={medium} onValueChange={setMedium}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {MEDIUMS.map((m) => (
                <Select.Item key={m.value} value={m.value}>
                  {m.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div>
          <Label size="small">Campaign name</Label>
          <Input size="small" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="diwali-sale" />
        </div>
        <div>
          <Label size="small">Which post or ad (optional)</Label>
          <Input size="small" value={content} onChange={(e) => setContent(e.target.value)} placeholder="reel-1" />
        </div>
      </div>
      <div className="mx-6 mt-3 flex items-center gap-2 rounded-md border bg-ui-bg-subtle px-3 py-2">
        <Text size="small" className={`min-w-0 flex-1 break-all font-mono text-[12px] ${ready ? "" : "text-ui-fg-muted"}`}>
          {ready ? full : "Add where it will be posted and a campaign name."}
        </Text>
        {ready && <Copy content={full} />}
      </div>
      {ready && !links.isError && (
        <div className="mx-6 mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label size="small">Short link (optional)</Label>
            <div className="flex items-center gap-1">
              <Text size="small" className="text-ui-fg-muted">
                /go/
              </Text>
              <Input size="small" value={short} onChange={(e) => setShort(e.target.value)} placeholder={slug(campaign) || "diwali"} className="w-[200px]" />
            </div>
          </div>
          <Button size="small" variant="secondary" disabled={!slug(short) || make.isPending} onClick={() => make.mutate()}>
            Make short link
          </Button>
        </div>
      )}
      {!!links.data?.length && (
        <div className="pt-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Short link</Table.HeaderCell>
                <Table.HeaderCell>Goes to</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Clicks</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {links.data.map((r) => (
                <Table.Row key={r.id}>
                  <Table.Cell className="font-mono text-[12px]">
                    {r.from_path} <Copy content={`${store.replace(/\/$/, "")}${r.from_path}`} />
                  </Table.Cell>
                  <Table.Cell className="max-w-[420px] truncate font-mono text-[12px]">{r.to_path}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{num(r.hits)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Text size="xsmall" className="px-6 pt-2 text-ui-fg-muted">
            Short links are kept with the other redirects in SEO → Redirects.
          </Text>
        </div>
      )}
    </Section>
  )
}

function Sources({ days }: { days: string }) {
  const { data, isLoading, error } = useReport<ShopReport>("shop", days)
  if (isLoading) return <Empty>Loading…</Empty>
  if (error) return <Alert variant="error" className="m-6">{(error as Error).message}</Alert>
  return (
    <>
      <Section title="Where visits came from" note="A campaign tag on the link, else the website the visitor came from (Google, Instagram…), else Direct.">
        {!data?.sources.length ? (
          <Empty>No visits in this period yet.</Empty>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell>Kind</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Visits</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Sales</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Visits that ordered</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.sources.map((r) => (
                <Table.Row key={r.source}>
                  <Table.Cell>{r.source}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">{r.medium || "–"}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{num(r.visits)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{num(r.orders)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{rupees(r.revenue)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{r.visits ? pct(Math.min(1, r.orders / r.visits)) : "–"}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Section>
      <Section title="Campaigns">
        {!data?.campaigns.length ? (
          <Empty>No visits from campaign links yet. Make one below.</Empty>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Campaign</Table.HeaderCell>
                <Table.HeaderCell>Source</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Visits</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Sales</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.campaigns.map((r) => (
                <Table.Row key={r.campaign}>
                  <Table.Cell>{r.campaign}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">{r.source || "–"}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{num(r.visits)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{num(r.orders)}</Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{rupees(r.revenue)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Section>
      <LinkBuilder />
    </>
  )
}

function Searches({ days }: { days: string }) {
  const { data, isLoading, error } = useReport<SearchReport>("search", days)
  if (isLoading) return <Empty>Loading…</Empty>
  if (error) return <Alert variant="error" className="m-6">{(error as Error).message}</Alert>
  if (!data) return null
  const terms = (rows: SearchReport["terms"], emptyCol: boolean) => (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Searched for</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Times</Table.HeaderCell>
          <Table.HeaderCell className="text-right">{emptyCol ? "Found nothing" : "Products found"}</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.term}>
            <Table.Cell>{r.term}</Table.Cell>
            <Table.Cell className="text-right tabular-nums">{num(r.searches)}</Table.Cell>
            <Table.Cell className="text-right tabular-nums">{emptyCol ? num(r.empty) : r.results == null ? "–" : num(r.results)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
  return (
    <>
      <Tiles
        items={[
          { label: "Searches", value: num(data.total) },
          { label: "Found nothing", value: num(data.empty) },
          { label: "Different words", value: num(data.terms.length) },
        ]}
      />
      <div className="grid gap-2 xl:grid-cols-2">
        <Section title="Searches that found nothing" note="Ideas for new products, product names, or articles.">
          {data.nothing_found.length ? terms(data.nothing_found, true) : <Empty>Every search found something.</Empty>}
        </Section>
        <Section title="Most searched">{data.terms.length ? terms(data.terms.slice(0, 50), false) : <Empty>No searches in this period yet.</Empty>}</Section>
      </div>
    </>
  )
}

const MODE_LABEL: Record<string, string> = { online: "Online (matched)", friend: "With a friend", arena: "Tournament arena", computer: "Against the computer", house: "House players" }
const ENDING_LABEL: Record<string, string> = {
  checkmate: "Checkmate",
  resign: "Resigned",
  timeout: "Ran out of time",
  abandoned: "Left the game",
  aborted: "Cancelled early",
  "no-start": "Never started",
  stalemate: "Stalemate",
  agreement: "Draw agreed",
  repetition: "Repetition",
  insufficient: "Not enough pieces",
  "fifty-move": "50-move rule",
}

function Play({ days }: { days: string }) {
  const { data, isLoading, error } = useReport<PlayReport>("play", days)
  const daily = useMemo(() => (data?.available ? allDays(data.daily, Number(days), { games: 0 }) : []), [data, days])
  if (isLoading) return <Empty>Loading…</Empty>
  if (error) return <Alert variant="error" className="m-6">{(error as Error).message}</Alert>
  if (!data?.available) return <Empty>Play hasn&apos;t been set up on this database yet.</Empty>
  const t = data.totals
  const list = (rows: { label: string; games: number }[]) => {
    const max = Math.max(1, ...rows.map((r) => r.games))
    return (
      <ul className="space-y-1.5 px-6">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[150px_1fr_48px] items-center gap-3">
            <Text size="small" className="truncate">
              {r.label}
            </Text>
            <div className="h-3 overflow-hidden rounded bg-ui-bg-subtle">
              <div className="h-full rounded bg-ui-fg-interactive opacity-80" style={{ width: `${(r.games / max) * 100}%` }} />
            </div>
            <Text size="small" className="text-right tabular-nums">
              {num(r.games)}
            </Text>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      <Tiles
        items={[
          { label: "Games started", value: num(t.started) },
          { label: "Players", value: num(t.players) },
          { label: "New players", value: num(t.new_players) },
          { label: "Rated games", value: num(t.rated) },
          { label: "Tournament games", value: num(t.tournament) },
          { label: "Puzzles solved", value: data.puzzles.attempts ? `${num(data.puzzles.solved)} of ${num(data.puzzles.attempts)}` : "0" },
        ]}
      />
      {daily.length > 1 && (
        <div className="px-6 pt-5">
          <Text size="xsmall" className="mb-2 text-ui-fg-subtle">
            Games per day
          </Text>
          <Bars values={daily.map((d) => d.games)} labels={daily.map((d) => shortDay(d.day))} format={num} label="Games per day" />
        </div>
      )}
      <div className="grid gap-2 pb-2 lg:grid-cols-3">
        <Section title="How people play">{data.modes.length ? list(data.modes.map((m) => ({ label: MODE_LABEL[m.mode] ?? m.mode, games: m.games }))) : <Empty>No games yet.</Empty>}</Section>
        <Section title="Clocks">{data.speeds.length ? list(data.speeds.map((s) => ({ label: `${s.speed} ${s.clock}`, games: s.games }))) : <Empty>No games yet.</Empty>}</Section>
        <Section title="How games ended">{data.endings.length ? list(data.endings.map((e) => ({ label: ENDING_LABEL[e.reason] ?? e.reason, games: e.games }))) : <Empty>No finished games yet.</Empty>}</Section>
      </div>
    </>
  )
}

const AnalyticsPage = () => {
  const [days, setDays] = useState("7")
  const [tab, setTab] = useState("overview")
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <Heading>Analytics</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Counted by the store itself. Shop events are kept for the number of days set in{" "}
            <Link to="/settings/marketing" className="text-ui-fg-interactive hover:underline">
              Settings → Marketing
            </Link>
            .
          </Text>
        </div>
        <Select size="small" value={days} onValueChange={setDays}>
          <Select.Trigger className="w-[160px]">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {PERIODS.map((p) => (
              <Select.Item key={p.value} value={p.value}>
                {p.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List className="border-b px-6">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="sources">Sources &amp; campaigns</Tabs.Trigger>
          <Tabs.Trigger value="search">Site search</Tabs.Trigger>
          <Tabs.Trigger value="play">Play</Tabs.Trigger>
        </Tabs.List>
        <div className="pb-6">
          <Tabs.Content value="overview">
            <Overview days={days} />
          </Tabs.Content>
          <Tabs.Content value="sources">
            <Sources days={days} />
          </Tabs.Content>
          <Tabs.Content value="search">
            <Searches days={days} />
          </Tabs.Content>
          <Tabs.Content value="play">
            <Play days={days} />
          </Tabs.Content>
        </div>
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Analytics", icon: ChartPie, rank: 5 })

export default AnalyticsPage
