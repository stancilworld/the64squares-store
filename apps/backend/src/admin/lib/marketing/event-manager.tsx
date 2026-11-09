import { Badge, Button, Drawer, Heading, Input, Select, Switch, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../sdk"
import { DELIVERY_BADGE, EVENT_LABELS, EVENT_NAMES, type EventName, PLATFORM_LABELS, type Platform } from "./types"

type Delivery = { id: string; event_id: string; platform: Platform; channel: string; status: string; attempts: number; last_error: string | null; delivered_at: string | null }
type Row = {
  id: string
  event_id: string
  name: EventName
  source: string
  page: string | null
  order_id: string | null
  value: number | null
  currency: string | null
  created_at: string
  consent: { analytics: boolean; marketing: boolean } | null
  deliveries: Delivery[]
}
type Totals = {
  events: number
  deliveries: Record<string, number>
  by_platform: { platform: Platform; total: number; success: number; failed: number; pending: number }[]
  by_event: { name: EventName; total: number }[]
  last_success: { platform: Platform; event_name: EventName; at: string } | null
  recent_errors: { id: string; event_id: string; event_name: EventName; platform: Platform; last_error: string | null; last_attempt_at: string; attempts: number; response_code: number | null }[]
}
type Response = { totals: Totals; events: Row[]; count: number; limit: number; offset: number }

const ALL = "__all"
const RANGES = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
]
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"
const money = (v: number | null, c: string | null) => (v == null ? "" : new Intl.NumberFormat("en-IN", { style: "currency", currency: c || "INR", maximumFractionDigits: 2 }).format(v))

function Tile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "red" | "orange" | "green" }) {
  const colour = tone === "red" ? "text-ui-fg-error" : tone === "orange" ? "text-ui-tag-orange-text" : tone === "green" ? "text-ui-tag-green-text" : ""
  return (
    <div className="rounded-lg border border-ui-border-base px-4 py-3">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <p className={`mt-1 txt-compact-xlarge-plus ${colour}`}>{value}</p>
    </div>
  )
}

// Settings → Marketing & integrations → Event Manager.
export function EventManager() {
  const qc = useQueryClient()
  const [days, setDays] = useState("7")
  const [platform, setPlatform] = useState(ALL)
  const [name, setName] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [orderId, setOrderId] = useState("")
  const [eventId, setEventId] = useState("")
  const [offset, setOffset] = useState(0)
  const [live, setLive] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const PAGE = 50

  const query = {
    from: new Date(Date.now() - Number(days) * 86_400_000).toISOString(),
    limit: PAGE,
    offset,
    ...(platform !== ALL ? { platform } : {}),
    ...(name !== ALL ? { name } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(orderId.trim() ? { order_id: orderId.trim() } : {}),
    ...(eventId.trim() ? { event_id: eventId.trim() } : {}),
  }
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-events", days, platform, name, status, orderId, eventId, offset],
    queryFn: () => sdk.client.fetch<Response>("/admin/marketing/events", { query }),
    refetchInterval: live ? 10_000 : false,
  })

  const retryAll = useMutation({
    mutationFn: () => sdk.client.fetch<{ queued: number }>("/admin/marketing/retry", { method: "POST", body: { all_failed: true } }),
    onSuccess: (r) => {
      toast.success(r.queued ? `Sending ${r.queued} again.` : "Nothing to retry.")
      setTimeout(() => qc.invalidateQueries({ queryKey: ["marketing-events"] }), 2500)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const t = data?.totals
  const delivered = (t?.deliveries.success ?? 0) + (t?.deliveries.browser ?? 0)
  return (
    <div className="flex flex-col divide-y">
      <div className="flex flex-wrap items-end gap-3 px-6 py-4">
        <div className="w-[150px]">
          <Select value={days} onValueChange={(v) => (setDays(v), setOffset(0))}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {RANGES.map((r) => (
                <Select.Item key={r.value} value={r.value}>
                  {r.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-[190px]">
          <Select value={platform} onValueChange={(v) => (setPlatform(v), setOffset(0))}>
            <Select.Trigger>
              <Select.Value placeholder="Platform" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>All platforms</Select.Item>
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                <Select.Item key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-[200px]">
          <Select value={name} onValueChange={(v) => (setName(v), setOffset(0))}>
            <Select.Trigger>
              <Select.Value placeholder="Event" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>All events</Select.Item>
              {EVENT_NAMES.map((n) => (
                <Select.Item key={n} value={n}>
                  {EVENT_LABELS[n]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-[160px]">
          <Select value={status} onValueChange={(v) => (setStatus(v), setOffset(0))}>
            <Select.Trigger>
              <Select.Value placeholder="Status" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>Any status</Select.Item>
              {Object.entries(DELIVERY_BADGE).map(([k, b]) => (
                <Select.Item key={k} value={k}>
                  {b.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <Input className="w-[200px]" size="small" placeholder="Order ID (order_…)" value={orderId} onChange={(e) => (setOrderId(e.target.value), setOffset(0))} />
        <Input className="w-[200px]" size="small" placeholder="Event ID" value={eventId} onChange={(e) => (setEventId(e.target.value), setOffset(0))} />
        <label className="ml-auto flex items-center gap-2">
          <Switch checked={live} onCheckedChange={setLive} />
          <Text size="small">Refresh every 10 s</Text>
        </label>
      </div>

      <div className="grid gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Events" value={t?.events ?? "…"} />
        <Tile label="Delivered" value={t ? delivered : "…"} tone="green" />
        <Tile label="Failed" value={t?.deliveries.failed ?? "…"} tone={t?.deliveries.failed ? "red" : undefined} />
        <Tile label="Pending" value={t?.deliveries.pending ?? "…"} tone={t?.deliveries.pending ? "orange" : undefined} />
        <Tile label="Last delivered by the server" value={<span className="txt-compact-small-plus">{t?.last_success ? `${PLATFORM_LABELS[t.last_success.platform]}, ${when(t.last_success.at)}` : "None yet"}</span>} />
      </div>

      {t && (t.by_platform.length > 0 || t.by_event.length > 0) && (
        <div className="grid gap-6 px-6 py-4 lg:grid-cols-2">
          <div>
            <Heading level="h3">By platform</Heading>
            <Table className="mt-2">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Platform</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Delivered</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Pending</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Failed</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {t.by_platform.map((p) => (
                  <Table.Row key={p.platform}>
                    <Table.Cell>{PLATFORM_LABELS[p.platform]}</Table.Cell>
                    <Table.Cell className="text-right">{p.success}</Table.Cell>
                    <Table.Cell className="text-right">{p.pending}</Table.Cell>
                    <Table.Cell className={`text-right ${p.failed ? "text-ui-fg-error" : ""}`}>{p.failed}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          <div>
            <Heading level="h3">By event</Heading>
            <Table className="mt-2">
              <Table.Body>
                {t.by_event.map((e) => (
                  <Table.Row key={e.name}>
                    <Table.Cell>{EVENT_LABELS[e.name]}</Table.Cell>
                    <Table.Cell className="text-right">{e.total}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      )}

      {t && t.recent_errors.length > 0 && (
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <Heading level="h3">Recent errors</Heading>
            <Button size="small" variant="secondary" isLoading={retryAll.isPending} onClick={() => retryAll.mutate()}>
              Retry all failed
            </Button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {t.recent_errors.map((e) => (
              <li key={e.id} className="rounded-md bg-ui-bg-subtle px-3 py-2">
                <Text size="small">
                  <span className="txt-compact-small-plus">
                    {PLATFORM_LABELS[e.platform]} · {EVENT_LABELS[e.event_name]}
                  </span>{" "}
                  <span className="text-ui-fg-subtle">
                    {when(e.last_attempt_at)}, after {e.attempts} {e.attempts === 1 ? "try" : "tries"}
                    {e.response_code ? ` (answer ${e.response_code})` : ""}
                  </span>
                </Text>
                <Text size="small" className="text-ui-fg-error">
                  {e.last_error}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Time</Table.HeaderCell>
              <Table.HeaderCell>Event</Table.HeaderCell>
              <Table.HeaderCell>Value</Table.HeaderCell>
              <Table.HeaderCell>Page or order</Table.HeaderCell>
              <Table.HeaderCell>Sent to</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.events ?? []).map((r) => (
              <Table.Row key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                <Table.Cell className="whitespace-nowrap">{when(r.created_at)}</Table.Cell>
                <Table.Cell>
                  {EVENT_LABELS[r.name] ?? r.name}
                  <span className="ml-1 text-ui-fg-muted txt-compact-xsmall">{r.source === "server" ? "· server" : ""}</span>
                </Table.Cell>
                <Table.Cell>{money(r.value, r.currency)}</Table.Cell>
                <Table.Cell className="max-w-[220px] truncate">{r.order_id ?? r.page ?? ""}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {r.deliveries.length ? (
                      r.deliveries.map((d) => (
                        <Badge key={d.id} size="2xsmall" color={DELIVERY_BADGE[d.status]?.color ?? "grey"}>
                          {PLATFORM_LABELS[d.platform]}: {DELIVERY_BADGE[d.status]?.label ?? d.status}
                        </Badge>
                      ))
                    ) : (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {r.consent && !r.consent.analytics && !r.consent.marketing ? "Visitor allowed essential cookies only" : "No platform"}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !data?.events.length && (
          <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
            No events for these filters. Events are recorded once at least one integration is switched on.
          </Text>
        )}
        {data && data.count > PAGE && (
          <Table.Pagination
            count={data.count}
            pageSize={PAGE}
            pageIndex={offset / PAGE}
            pageCount={Math.ceil(data.count / PAGE)}
            canPreviousPage={offset > 0}
            canNextPage={offset + PAGE < data.count}
            previousPage={() => setOffset(Math.max(0, offset - PAGE))}
            nextPage={() => setOffset(offset + PAGE)}
          />
        )}
      </div>
      <EventDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

type Detail = {
  event: { id: string; event_id: string; name: EventName; source: string; page: string | null; order_id: string | null; value: number | null; currency: string | null; created_at: string; data: Record<string, unknown> | null; consent: { analytics: boolean; marketing: boolean } | null }
  deliveries: (Delivery & { response_code: number | null; last_attempt_at: string | null; next_attempt_at: string | null; payload: unknown })[]
}

function EventDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["marketing-event", id], queryFn: () => sdk.client.fetch<Detail>(`/admin/marketing/events/${id}`), enabled: !!id })
  const retry = useMutation({
    mutationFn: (ids: string[]) => sdk.client.fetch<{ queued: number }>("/admin/marketing/retry", { method: "POST", body: { ids } }),
    onSuccess: () => {
      toast.success("Sending again.")
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["marketing-event", id] })
        qc.invalidateQueries({ queryKey: ["marketing-events"] })
      }, 2500)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const e = data?.event
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[620px]">
        <Drawer.Header>
          <Drawer.Title>{e ? (EVENT_LABELS[e.name] ?? e.name) : "Event"}</Drawer.Title>
          <Drawer.Description>{e ? `${when(e.created_at)} · ${e.source === "server" ? "made by the store" : "reported by the visitor's browser"}` : ""}</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-5 overflow-y-auto">
          {e && (
            <>
              <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 txt-compact-small">
                <dt className="text-ui-fg-subtle">Event ID</dt>
                <dd className="break-all font-mono">{e.event_id}</dd>
                <dt className="text-ui-fg-subtle">Same ID on every platform</dt>
                <dd>Yes: Meta counts the browser and server copies once.</dd>
                {e.order_id && (
                  <>
                    <dt className="text-ui-fg-subtle">Order</dt>
                    <dd className="font-mono">{e.order_id}</dd>
                  </>
                )}
                {e.page && (
                  <>
                    <dt className="text-ui-fg-subtle">Page</dt>
                    <dd className="break-all">{e.page}</dd>
                  </>
                )}
                {e.value != null && (
                  <>
                    <dt className="text-ui-fg-subtle">Value</dt>
                    <dd>{money(e.value, e.currency)}</dd>
                  </>
                )}
                <dt className="text-ui-fg-subtle">Visitor allowed</dt>
                <dd>{e.consent ? [e.consent.analytics && "analytics", e.consent.marketing && "marketing"].filter(Boolean).join(" and ") || "essential cookies only" : "—"}</dd>
              </dl>
              {e.data && Object.keys(e.data).length > 0 && (
                <div>
                  <Heading level="h3">Details sent</Heading>
                  <pre className="mt-1 max-h-[220px] overflow-auto rounded-md bg-ui-bg-subtle p-3 txt-compact-xsmall">{JSON.stringify(e.data, null, 2)}</pre>
                </div>
              )}
              <div>
                <Heading level="h3">Deliveries</Heading>
                <ul className="mt-2 flex flex-col gap-2">
                  {data!.deliveries.map((d) => (
                    <li key={d.id} className="rounded-md border border-ui-border-base p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Text weight="plus" size="small">
                          {PLATFORM_LABELS[d.platform]} <span className="font-normal text-ui-fg-subtle">({d.channel === "server" ? "from the store's server" : "from the visitor's browser"})</span>
                        </Text>
                        <Badge size="2xsmall" color={DELIVERY_BADGE[d.status]?.color ?? "grey"}>
                          {DELIVERY_BADGE[d.status]?.label ?? d.status}
                        </Badge>
                      </div>
                      {d.channel === "server" && (
                        <Text size="small" className="mt-1 text-ui-fg-subtle">
                          {d.attempts} {d.attempts === 1 ? "try" : "tries"}
                          {d.last_attempt_at ? `, last ${when(d.last_attempt_at)}` : ""}
                          {d.response_code ? ` (answer ${d.response_code})` : ""}
                          {d.status === "pending" && d.next_attempt_at ? `. Next try ${when(d.next_attempt_at)}.` : ""}
                        </Text>
                      )}
                      {d.last_error && (
                        <Text size="small" className={d.status === "skipped" ? "mt-1 text-ui-fg-subtle" : "mt-1 text-ui-fg-error"}>
                          {d.last_error}
                        </Text>
                      )}
                      {d.payload != null && (
                        <details className="mt-2">
                          <summary className="cursor-pointer txt-compact-small text-ui-fg-interactive">What was sent</summary>
                          <pre className="mt-1 max-h-[240px] overflow-auto rounded-md bg-ui-bg-subtle p-3 txt-compact-xsmall">{JSON.stringify(d.payload, null, 2)}</pre>
                        </details>
                      )}
                      {d.channel === "server" && (d.status === "failed" || d.status === "pending") && (
                        <Button className="mt-2" size="small" variant="secondary" isLoading={retry.isPending} onClick={() => retry.mutate([d.id])}>
                          Send again now
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
