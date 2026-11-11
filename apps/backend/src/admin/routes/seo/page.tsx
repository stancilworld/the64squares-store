import { defineRouteConfig } from "@medusajs/admin-sdk"
import { MagnifyingGlass } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, Input, Select, Switch, Table, Tabs, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { Check } from "../../../lib/seo-audit"
import { sdk } from "../../lib/sdk"
import { EMPTY_SEO, ScoreDot, SeoPanel, type SeoValues } from "../../lib/seo-panel"
import { SearchConsole } from "../../lib/search-console"

// SEO: every page's health (like Yoast's overview), redirects for moved pages, addresses
// visitors couldn't find, and Google Search Console.

type SeoPage = {
  type: "product" | "news" | "post" | "tournament" | "page" | "static"
  key: string
  label: string
  path: string
  seo: SeoValues
  effective: { title: string; description: string; image: string | null }
  defaults: { title: string; description: string; image: string | null }
  html: string
  status: "live" | "draft"
  checks: Check[]
  score: Check["level"]
  edit_url: string | null
}
type Redirect = { id: string; from_path: string; to_path: string; permanent: boolean; hits: number; last_hit_at: string | null }
type NotFound = { id: string; path: string; hits: number; referrer: string | null; last_seen_at: string }

const TYPE_LABEL: Record<SeoPage["type"], string> = { static: "Page", product: "Product", news: "News", post: "Journal", tournament: "Tournament", page: "Help page" }
const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never")

function EditDrawer({ page, onClose }: { page: SeoPage | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [value, setValue] = useState<SeoValues>(EMPTY_SEO)
  const [forKey, setForKey] = useState<string | null>(null)
  if (page && forKey !== `${page.type}:${page.key}`) {
    setForKey(`${page.type}:${page.key}`)
    setValue(page.seo)
  }
  const save = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/seo/meta", { method: "POST", body: { target_type: page!.type, target_key: page!.key, ...value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seo-pages"] })
      toast.success("Saved. Google sees the change next time it visits the page.")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })
  const defaults = page?.defaults ?? { title: "", description: "", image: null }
  return (
    <Drawer open={!!page} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[720px]">
        <Drawer.Header>
          <Drawer.Title>{page?.label}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto">
          {page && <SeoPanel value={value} onChange={setValue} defaults={defaults} path={page.path} html={page.html} compact />}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary" size="small">
              Cancel
            </Button>
          </Drawer.Close>
          <Button size="small" isLoading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

function Health() {
  const { data } = useQuery({ queryKey: ["seo-pages"], queryFn: () => sdk.client.fetch<{ pages: SeoPage[] }>("/admin/seo/pages") })
  const [type, setType] = useState<"all" | SeoPage["type"]>("all")
  const [level, setLevel] = useState<"all" | Check["level"]>("all")
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState<SeoPage | null>(null)
  const pages = useMemo(
    () =>
      (data?.pages ?? [])
        .filter((p) => p.status === "live")
        .filter((p) => type === "all" || p.type === type)
        .filter((p) => level === "all" || p.score === level)
        .filter((p) => !q || `${p.label} ${p.path}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => ["bad", "ok", "good"].indexOf(a.score) - ["bad", "ok", "good"].indexOf(b.score)),
    [data, type, level, q]
  )
  if (!data) return <Text className="px-6 py-6">Checking every page…</Text>
  const live = data.pages.filter((p) => p.status === "live")
  const count = (l: Check["level"]) => live.filter((p) => p.score === l).length

  return (
    <div>
      <div className="grid grid-cols-3 divide-x border-b">
        {(["bad", "ok", "good"] as const).map((l) => (
          <button key={l} type="button" onClick={() => setLevel(level === l ? "all" : l)} className={`px-6 py-4 text-left ${level === l ? "bg-ui-bg-highlight" : "hover:bg-ui-bg-base-hover"}`}>
            <div className="flex items-center gap-2">
              <ScoreDot level={l} />
              <Text size="small" className="text-ui-fg-subtle">
                {l === "bad" ? "Needs work" : l === "ok" ? "Could be better" : "Good"}
              </Text>
            </div>
            <Text className="mt-1 text-[24px] font-semibold">{count(l)}</Text>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Input size="small" placeholder="Search pages" value={q} onChange={(e) => setQ(e.target.value)} className="w-[220px]" />
        <Select size="small" value={type} onValueChange={(v) => setType(v as typeof type)}>
          <Select.Trigger className="w-[160px]">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All pages</Select.Item>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <Select.Item key={k} value={k}>
                {v}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Text size="small" className="text-ui-fg-muted">
          {pages.length} page{pages.length === 1 ? "" : "s"}
        </Text>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Page</Table.HeaderCell>
            <Table.HeaderCell>Type</Table.HeaderCell>
            <Table.HeaderCell>Most important to fix</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {pages.map((p) => {
            const worst = p.checks.find((c) => c.level === "bad") ?? p.checks.find((c) => c.level === "ok")
            return (
              <Table.Row key={`${p.type}:${p.key}`} className="cursor-pointer" onClick={() => setEditing(p)}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <ScoreDot level={p.score} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.label}</p>
                      <p className="truncate text-[12px] text-ui-fg-muted">{p.path}</p>
                    </div>
                    {p.seo.noindex && (
                      <Badge size="2xsmall" color="grey">
                        Hidden from Google
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>{TYPE_LABEL[p.type]}</Table.Cell>
                <Table.Cell>
                  <span className="line-clamp-2 text-ui-fg-subtle">{worst?.text ?? "All good"}</span>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table>
      <EditDrawer page={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function Redirects({ prefill, clearPrefill }: { prefill: string; clearPrefill: () => void }) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const { data } = useQuery({ queryKey: ["seo-redirects"], queryFn: () => sdk.client.fetch<{ redirects: Redirect[] }>("/admin/seo/redirects") })
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [permanent, setPermanent] = useState(true)
  if (prefill && prefill !== from) {
    setFrom(prefill)
    clearPrefill()
  }
  const add = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/seo/redirects", { method: "POST", body: { from_path: from, to_path: to, permanent } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seo-redirects"] })
      qc.invalidateQueries({ queryKey: ["seo-not-found"] })
      setFrom("")
      setTo("")
      toast.success("Redirect added. It works on the website within a minute.")
    },
    onError: (e: Error) => toast.error("Could not add it", { description: e.message }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/seo/redirects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo-redirects"] }),
  })
  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-3 px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Old address
          </Text>
          <Input size="small" placeholder="/products/old-name" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Send visitors to
          </Text>
          <Input size="small" placeholder="/products/new-name" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-[13px] text-ui-fg-subtle">
          <Switch checked={permanent} onCheckedChange={setPermanent} />
          Permanent (moved for good)
        </label>
        <Button size="small" type="submit" isLoading={add.isPending} disabled={!from.trim() || !to.trim()}>
          Add redirect
        </Button>
      </form>
      {!data?.redirects.length ? (
        <Text size="small" className="px-6 pb-6 text-ui-fg-subtle">
          No redirects yet. When you rename a product or page, add its old address here so old links and Google still find it.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Old address</Table.HeaderCell>
              <Table.HeaderCell>Goes to</Table.HeaderCell>
              <Table.HeaderCell>Used</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.redirects.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell className="font-mono text-[12px]">{r.from_path}</Table.Cell>
                <Table.Cell className="font-mono text-[12px]">
                  {r.to_path}
                  {!r.permanent && (
                    <Badge size="2xsmall" color="grey" className="ml-2">
                      Temporary
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {r.hits} time{r.hits === 1 ? "" : "s"}
                  <span className="block text-[12px] text-ui-fg-muted">Last: {ago(r.last_hit_at)}</span>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={async () => {
                      if (await prompt({ title: "Remove this redirect?", description: `${r.from_path} will show "page not found" again.` })) remove.mutate(r.id)
                    }}
                  >
                    Remove
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

function NotFoundLog({ onRedirect }: { onRedirect: (path: string) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["seo-not-found"], queryFn: () => sdk.client.fetch<{ not_found: NotFound[] }>("/admin/seo/not-found") })
  const clear = useMutation({
    mutationFn: (ids: string[]) => sdk.client.fetch("/admin/seo/not-found", { method: "POST", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo-not-found"] }),
  })
  if (!data) return <Text className="px-6 py-6">Loading…</Text>
  if (!data.not_found.length)
    return (
      <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
        Nobody has hit a missing page yet. Broken links people follow show up here, so you can redirect them.
      </Text>
    )
  return (
    <div>
      <div className="flex items-center justify-between px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          Addresses visitors tried that don&apos;t exist. Redirect the common ones to the right page.
        </Text>
        <Button size="small" variant="secondary" onClick={() => clear.mutate(data.not_found.map((n) => n.id))}>
          Clear all
        </Button>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Address</Table.HeaderCell>
            <Table.HeaderCell>Tries</Table.HeaderCell>
            <Table.HeaderCell>Came from</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.not_found.map((n) => (
            <Table.Row key={n.id}>
              <Table.Cell className="font-mono text-[12px]">{n.path}</Table.Cell>
              <Table.Cell>
                {n.hits}
                <span className="block text-[12px] text-ui-fg-muted">Last: {ago(n.last_seen_at)}</span>
              </Table.Cell>
              <Table.Cell className="max-w-[260px] truncate text-[12px] text-ui-fg-subtle">{n.referrer || "Typed or bookmarked"}</Table.Cell>
              <Table.Cell className="whitespace-nowrap text-right">
                <Button size="small" variant="secondary" onClick={() => onRedirect(n.path)}>
                  Redirect
                </Button>
                <Button size="small" variant="transparent" onClick={() => clear.mutate([n.id])}>
                  Clear
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  )
}

const SeoPageRoute = () => {
  const [tab, setTab] = useState("health")
  const [prefill, setPrefill] = useState("")
  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h1">SEO</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          How your pages look in Google, and what to fix. Click a page to edit its search title, description, focus keyword and share picture. Site-wide settings are
          in{" "}
          <Link to="/settings/seo" className="text-ui-fg-interactive hover:underline">
            Settings → SEO &amp; analytics
          </Link>
          .
        </Text>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List className="border-b px-6">
          <Tabs.Trigger value="health">Health</Tabs.Trigger>
          <Tabs.Trigger value="console">Google Search Console</Tabs.Trigger>
          <Tabs.Trigger value="redirects">Redirects</Tabs.Trigger>
          <Tabs.Trigger value="missing">Not found</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="health">
          <Health />
        </Tabs.Content>
        <Tabs.Content value="console">
          <SearchConsole />
        </Tabs.Content>
        <Tabs.Content value="redirects">
          <Redirects prefill={prefill} clearPrefill={() => setPrefill("")} />
        </Tabs.Content>
        <Tabs.Content value="missing">
          <NotFoundLog
            onRedirect={(p) => {
              setPrefill(p)
              setTab("redirects")
            }}
          />
        </Tabs.Content>
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "SEO", icon: MagnifyingGlass, rank: 6 })

export default SeoPageRoute
