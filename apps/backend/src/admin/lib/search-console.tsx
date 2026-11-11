import { Alert, Button, Copy, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "./sdk"

// Google Search Console inside the admin: connect once, then see searches, clicks and pages.

type Status = { google_keys: boolean; callback_url: string; connected: boolean; email: string | null; site_url: string | null; sites: string[]; error: string | null }
type Line = { key: string; clicks: number; impressions: number; ctr: number; position: number }
type Report = { range: { start: string; end: string }; totals: { clicks: number; impressions: number; ctr: number; position: number }; daily: Line[]; queries: Line[]; pages: Line[] }

const n = (x: number) => x.toLocaleString("en-IN")
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

function Spark({ daily }: { daily: Line[] }) {
  if (daily.length < 2) return null
  const max = Math.max(1, ...daily.map((d) => d.clicks))
  const w = 600
  const h = 80
  const pts = daily.map((d, i) => `${(i / (daily.length - 1)) * w},${h - (d.clicks / max) * (h - 6) - 3}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[80px] w-full" preserveAspectRatio="none" role="img" aria-label="Clicks per day">
      <polyline points={pts} fill="none" stroke="var(--fg-interactive)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Lines({ title, rows, isPage }: { title: string; rows: Line[]; isPage?: boolean }) {
  return (
    <div className="min-w-0">
      <Text size="small" weight="plus" className="px-6 pb-2 pt-4">
        {title}
      </Text>
      {!rows.length ? (
        <Text size="small" className="px-6 pb-4 text-ui-fg-subtle">
          Nothing yet. Google needs a few days of data.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{isPage ? "Page" : "Search"}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Clicks</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Shown</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Position</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.slice(0, 25).map((r) => (
              <Table.Row key={r.key}>
                <Table.Cell className="max-w-[320px] truncate">{isPage ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key}</Table.Cell>
                <Table.Cell className="text-right">{n(r.clicks)}</Table.Cell>
                <Table.Cell className="text-right">{n(r.impressions)}</Table.Cell>
                <Table.Cell className="text-right">{r.position.toFixed(1)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

export function SearchConsole() {
  const qc = useQueryClient()
  const [days, setDays] = useState("28")
  const { data: status } = useQuery({ queryKey: ["gsc"], queryFn: () => sdk.client.fetch<Status>("/admin/seo/gsc") })
  const ready = !!status?.connected && !!status.site_url
  const { data: report, error } = useQuery({
    queryKey: ["gsc-report", days, status?.site_url],
    queryFn: () => sdk.client.fetch<Report>(`/admin/seo/gsc/report?days=${days}`),
    enabled: ready,
    retry: false,
  })

  // Back from Google's sign-in.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const r = p.get("gsc")
    if (!r) return
    if (r === "connected") toast.success("Search Console connected")
    else if (r === "error") toast.error("Couldn't connect", { description: p.get("message") ?? undefined })
    else if (r === "expired") toast.error("That took too long. Please connect again.")
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const connect = useMutation({
    mutationFn: () => sdk.client.fetch<{ url: string }>("/admin/seo/gsc/connect", { method: "POST" }),
    onSuccess: (r) => {
      window.location.href = r.url
    },
    onError: (e: Error) => toast.error("Couldn't start", { description: e.message }),
  })
  const pick = useMutation({
    mutationFn: (site_url: string) => sdk.client.fetch("/admin/seo/gsc/site", { method: "POST", body: { site_url } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gsc"] }),
  })
  const disconnect = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/seo/gsc/disconnect", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gsc"] }),
  })

  if (!status) return <Text className="px-6 py-6">Loading…</Text>

  if (!status.connected)
    return (
      <div className="flex flex-col gap-4 px-6 py-6">
        <Text size="small" className="text-ui-fg-subtle">
          See which Google searches show your site, how often people click, and where you rank, without leaving the admin. Free; you connect once.
        </Text>
        {!status.google_keys ? (
          <Alert variant="warning">
            First add your Google Client ID and Secret in{" "}
            <Link to="/settings/payments" className="underline">
              Settings → Payments &amp; delivery → Keys
            </Link>{" "}
            (the same ones as &ldquo;Sign in with Google&rdquo;).
          </Alert>
        ) : null}
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] text-ui-fg-subtle">
          <li>
            Add and verify your site at search.google.com/search-console (choose &ldquo;Domain&rdquo; and add the TXT record at GoDaddy, or use the HTML tag in Settings → SEO &amp;
            analytics).
          </li>
          <li>In Google Cloud Console, open the same project as your Google sign-in keys and turn on the &ldquo;Google Search Console API&rdquo;.</li>
          <li>
            In that project&apos;s OAuth client, add this as an Authorised redirect URI:
            <span className="mt-1 flex items-center gap-2 font-mono text-[12px] text-ui-fg-base">
              {status.callback_url} <Copy content={status.callback_url} />
            </span>
          </li>
          <li>Click Connect and allow access with the Google account that owns the site in Search Console.</li>
        </ol>
        <div>
          <Button size="small" disabled={!status.google_keys} isLoading={connect.isPending} onClick={() => connect.mutate()}>
            Connect Google Search Console
          </Button>
        </div>
      </div>
    )

  return (
    <div className="pb-4">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          Connected as {status.email ?? "your Google account"}
        </Text>
        <Select size="small" value={status.site_url ?? undefined} onValueChange={(v) => pick.mutate(v)}>
          <Select.Trigger className="w-[260px]">
            <Select.Value placeholder="Choose the site" />
          </Select.Trigger>
          <Select.Content>
            {status.sites.map((s) => (
              <Select.Item key={s} value={s}>
                {s.replace("sc-domain:", "")}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Select size="small" value={days} onValueChange={setDays}>
          <Select.Trigger className="w-[140px]">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="7">Last 7 days</Select.Item>
            <Select.Item value="28">Last 28 days</Select.Item>
            <Select.Item value="90">Last 3 months</Select.Item>
          </Select.Content>
        </Select>
        <Button size="small" variant="transparent" className="ml-auto" onClick={() => disconnect.mutate()}>
          Disconnect
        </Button>
      </div>
      {status.error && (
        <div className="px-6 pb-3">
          <Alert variant="error">{status.error}</Alert>
        </div>
      )}
      {!status.sites.length && !status.error && (
        <div className="px-6 pb-3">
          <Alert variant="warning">This Google account has no verified sites in Search Console yet.</Alert>
        </div>
      )}
      {error && (
        <div className="px-6 pb-3">
          <Alert variant="error">{(error as Error).message}</Alert>
        </div>
      )}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-px border-y bg-ui-border-base md:grid-cols-4">
            {[
              ["Clicks", n(report.totals.clicks)],
              ["Times shown in Google", n(report.totals.impressions)],
              ["Click rate", pct(report.totals.ctr)],
              ["Average position", report.totals.position ? report.totals.position.toFixed(1) : "–"],
            ].map(([k, v]) => (
              <div key={k} className="bg-ui-bg-base px-6 py-4">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {k}
                </Text>
                <Text className="mt-1 text-[22px] font-semibold">{v}</Text>
              </div>
            ))}
          </div>
          <div className="px-6 pt-4">
            <Text size="xsmall" className="text-ui-fg-muted">
              Clicks per day, {report.range.start} to {report.range.end} (Google&apos;s figures arrive about 2 days late)
            </Text>
            <Spark daily={report.daily} />
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <Lines title="Top searches" rows={report.queries} />
            <Lines title="Top pages" rows={report.pages} isPage />
          </div>
        </>
      )}
    </div>
  )
}
