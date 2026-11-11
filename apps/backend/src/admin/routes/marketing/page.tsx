import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PaperPlane } from "@medusajs/icons"
import { Alert, Badge, Button, Container, Copy, Heading, Input, Label, Switch, Table, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"

// Marketing: automatic emails, web notifications, people waiting for sold-out items, friend
// invites, and the product feed for Google and Meta. The switches that show these on the
// website are in Website → Site features.

type Mail = { enabled: boolean; subject: string; heading: string; body: string; button_label: string; coupon_code: string; hours?: number; days?: number }
type Kind = "welcome" | "abandoned_cart" | "review_request" | "win_back" | "back_in_stock" | "referral_reward"
type Automations = Record<Kind, Mail>

const KINDS: { kind: Kind; title: string; when: string; timing?: { key: "hours" | "days"; label: string; min: number; max: number }; code: boolean; feature?: string }[] = [
  { kind: "welcome", title: "Welcome", when: "Right after someone joins the email list.", code: true },
  { kind: "abandoned_cart", title: "Cart reminder", when: "When a checkout with an email address isn't finished. Only to people who agreed to emails.", timing: { key: "hours", label: "Hours after", min: 1, max: 72 }, code: true },
  { kind: "review_request", title: "Review request", when: "Some days after an order, asking for a review.", timing: { key: "days", label: "Days after the order", min: 1, max: 60 }, code: false },
  { kind: "win_back", title: "We miss you", when: "When a customer on the email list hasn't ordered for a while.", timing: { key: "days", label: "Days since last order", min: 30, max: 365 }, code: true },
  { kind: "back_in_stock", title: "Back in stock", when: "When a sold-out item someone asked about is back.", code: false, feature: "Back-in-stock alerts" },
  { kind: "referral_reward", title: "Invite reward", when: "When a friend orders with a customer's invite code. The thank-you code is made for them.", code: false, feature: "Invite a friend" },
]

function MailEditor({ k, mail, onSaved }: { k: (typeof KINDS)[number]; mail: Mail; onSaved: (a: Automations) => void }) {
  const [draft, setDraft] = useState<Mail>(mail)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState("")
  useEffect(() => setDraft(mail), [mail])
  const save = useMutation({
    mutationFn: (m: Partial<Mail>) => sdk.client.fetch<{ automations: Automations }>("/admin/automations", { method: "POST", body: { [k.kind]: m } }),
    onSuccess: (r) => {
      onSaved(r.automations)
      toast.success("Saved")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })
  const test = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/automations/test", { method: "POST", body: { kind: k.kind, to } }),
    onSuccess: () => toast.success("Sample sent", { description: `Check ${to}` }),
    onError: (e: Error) => toast.error("Couldn't send the sample", { description: e.message }),
  })
  const set = (key: keyof Mail) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: key === "hours" || key === "days" ? Number(e.target.value) : e.target.value }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(mail)
  return (
    <div className="border-b px-6 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Text weight="plus">{k.title}</Text>
            {k.feature && (
              <Badge size="2xsmall" color="grey">
                needs {k.feature} on
              </Badge>
            )}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {k.when}
          </Text>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[13px] text-ui-fg-interactive hover:underline">
            {open ? "Close" : "Edit the email"}
          </button>
        </div>
        <Switch checked={mail.enabled} onCheckedChange={(v) => save.mutate({ enabled: v })} aria-label={`${k.title} email`} />
      </div>
      {open && (
        <div className="mt-4 grid gap-3 rounded-lg border bg-ui-bg-subtle p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label size="small">Subject</Label>
              <Input size="small" value={draft.subject} onChange={set("subject")} />
            </div>
            <div>
              <Label size="small">Heading</Label>
              <Input size="small" value={draft.heading} onChange={set("heading")} />
            </div>
          </div>
          <div>
            <Label size="small">Message</Label>
            <Textarea rows={4} value={draft.body} onChange={set("body")} />
            <Text size="xsmall" className="text-ui-fg-muted">
              A blank line starts a new paragraph. {"{name}"} is the customer&apos;s first name{k.kind === "review_request" || k.kind === "back_in_stock" ? ", {product} the product" : ""}.
            </Text>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label size="small">Button</Label>
              <Input size="small" value={draft.button_label} onChange={set("button_label")} />
            </div>
            {k.code && (
              <div>
                <Label size="small">Discount code (optional)</Label>
                <Input size="small" value={draft.coupon_code} onChange={set("coupon_code")} placeholder="WELCOME10" />
                <Text size="xsmall" className="text-ui-fg-muted">
                  Make it in{" "}
                  <Link to="/promotions" className="text-ui-fg-interactive hover:underline">
                    Discounts
                  </Link>{" "}
                  first.
                </Text>
              </div>
            )}
            {k.timing && (
              <div>
                <Label size="small">{k.timing.label}</Label>
                <Input size="small" type="number" min={k.timing.min} max={k.timing.max} value={draft[k.timing.key] ?? k.timing.min} onChange={set(k.timing.key)} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <div>
                <Label size="small">Send a sample to</Label>
                <Input size="small" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className="w-[220px]" />
              </div>
              <Button size="small" variant="secondary" disabled={!/^\S+@\S+\.\S+$/.test(to) || test.isPending || dirty} onClick={() => test.mutate()}>
                Send sample
              </Button>
            </div>
            <Button size="small" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
              Save
            </Button>
          </div>
          {dirty && (
            <Text size="xsmall" className="text-ui-fg-muted">
              Save first to send a sample of the changes.
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

function Emails() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ["automations"], queryFn: () => sdk.client.fetch<{ automations: Automations }>("/admin/automations") })
  if (isLoading) return <Text className="px-6 py-4 text-ui-fg-subtle">Loading…</Text>
  if (error || !data) return <Alert variant="error" className="m-6">{(error as Error)?.message ?? "Couldn't load"}</Alert>
  return (
    <>
      <Text size="small" className="px-6 pt-4 text-ui-fg-subtle">
        Checked every 15 minutes. Each email goes once per order, cart or customer. Offers go only to people on the email list, and every offer email has a &ldquo;Stop these emails&rdquo; link.
      </Text>
      <div className="mt-2">
        {KINDS.map((k) => (
          <MailEditor key={k.kind} k={k} mail={data.automations[k.kind]} onSaved={(a) => qc.setQueryData<{ automations: Automations }>(["automations"], { automations: a })} />
        ))}
      </div>
    </>
  )
}

type PushInfo = { subscribers: number; sends: { id: string; title: string; body: string; url: string; sent: number; failed: number; created_at: string }[] }

function Notifications() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["push"], queryFn: () => sdk.client.fetch<PushInfo>("/admin/push") })
  const [m, setM] = useState({ title: "", body: "", url: "/shop", image_url: "" })
  const send = useMutation({
    mutationFn: () => sdk.client.fetch<{ result: { sent: number; failed: number } }>("/admin/push/send", { method: "POST", body: { ...m, image_url: m.image_url || null } }),
    onSuccess: (r) => {
      toast.success("Sent", { description: `Reached ${r.result.sent} ${r.result.sent === 1 ? "browser" : "browsers"}.` })
      setM({ title: "", body: "", url: "/shop", image_url: "" })
      qc.invalidateQueries({ queryKey: ["push"] })
    },
    onError: (e: Error) => toast.error("Couldn't send", { description: e.message }),
  })
  return (
    <div className="px-6 py-4">
      <Text size="small" className="text-ui-fg-subtle">
        Short messages that pop up on the phone or computer of visitors who allowed them. Turn on the &ldquo;Allow notifications&rdquo; card in{" "}
        <Link to="/website/features" className="text-ui-fg-interactive hover:underline">
          Website → Site features
        </Link>
        . On iPhone they only work when the website is added to the home screen.
      </Text>
      <Text className="mt-3 text-[22px] font-semibold tabular-nums">{data?.subscribers ?? "–"}</Text>
      <Text size="xsmall" className="text-ui-fg-subtle">
        browsers get notifications
      </Text>
      <div className="mt-5 grid max-w-[640px] gap-3">
        <div>
          <Label size="small">Title</Label>
          <Input size="small" maxLength={60} value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="Diwali sale starts now" />
        </div>
        <div>
          <Label size="small">Message</Label>
          <Textarea rows={2} maxLength={160} value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} placeholder="20% off handmade chess sets until Sunday." />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label size="small">Opens</Label>
            <Input size="small" value={m.url} onChange={(e) => setM({ ...m, url: e.target.value })} placeholder="/shop" />
          </div>
          <div>
            <Label size="small">Picture address (optional)</Label>
            <Input size="small" value={m.image_url} onChange={(e) => setM({ ...m, image_url: e.target.value })} placeholder="https://…" />
          </div>
        </div>
        <div>
          <Button size="small" disabled={!m.title.trim() || !m.body.trim() || !data?.subscribers || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? "Sending…" : `Send to ${data?.subscribers ?? 0}`}
          </Button>
        </div>
      </div>
      {!!data?.sends.length && (
        <div className="-mx-6 mt-6">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Sent</Table.HeaderCell>
                <Table.HeaderCell>Message</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Reached</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.sends.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell className="whitespace-nowrap">{new Date(s.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Table.Cell>
                  <Table.Cell className="max-w-[420px] truncate">
                    <strong>{s.title}</strong> · {s.body}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{s.sent}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </div>
  )
}

type Waiting = {
  stock_alerts: { waiting: number; sent: number; items: { variant_id: string; product_id: string | null; title: string; option: string | null; waiting: number }[] }
  referrals: { codes: number; uses: number; rewards: number }
}

function Stock() {
  const { data } = useQuery({ queryKey: ["stock-alerts"], queryFn: () => sdk.client.fetch<Waiting>("/admin/automations/stock-alerts") })
  return (
    <div className="py-4">
      <Text size="small" className="px-6 text-ui-fg-subtle">
        People who asked to be emailed when a sold-out item is back. The email goes by itself when you add stock.
      </Text>
      <div className="mt-3 flex gap-10 px-6">
        <div>
          <Text className="text-[22px] font-semibold tabular-nums">{data?.stock_alerts.waiting ?? "–"}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            waiting
          </Text>
        </div>
        <div>
          <Text className="text-[22px] font-semibold tabular-nums">{data?.stock_alerts.sent ?? "–"}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            told it&apos;s back
          </Text>
        </div>
      </div>
      {!!data?.stock_alerts.items.length && (
        <div className="mt-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Item</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Waiting</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.stock_alerts.items.map((i) => (
                <Table.Row key={i.variant_id}>
                  <Table.Cell>
                    {i.product_id ? (
                      <Link to={`/products/${i.product_id}`} className="hover:underline">
                        {i.title}
                      </Link>
                    ) : (
                      i.title
                    )}
                    {i.option && <span className="text-ui-fg-subtle"> · {i.option}</span>}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{i.waiting}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </div>
  )
}

function Invites() {
  const { data } = useQuery({ queryKey: ["stock-alerts"], queryFn: () => sdk.client.fetch<Waiting>("/admin/automations/stock-alerts") })
  const r = data?.referrals
  return (
    <div className="px-6 py-4">
      <Text size="small" className="text-ui-fg-subtle">
        Customers find their invite code on their account page. A friend gets money off; when the friend&apos;s first order is over the minimum, the customer is emailed a one-time thank-you code. Set the amounts in{" "}
        <Link to="/website/features" className="text-ui-fg-interactive hover:underline">
          Website → Site features → Invite a friend
        </Link>
        .
      </Text>
      <div className="mt-3 flex gap-10">
        {[
          ["codes made", r?.codes],
          ["friends ordered", r?.uses],
          ["thank-you codes sent", r?.rewards],
        ].map(([label, n]) => (
          <div key={label as string}>
            <Text className="text-[22px] font-semibold tabular-nums">{n ?? "–"}</Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {label}
            </Text>
          </div>
        ))}
      </div>
      <Text size="small" className="mt-4 text-ui-fg-subtle">
        Working with an affiliate or influencer? Give them a campaign link from{" "}
        <Link to="/analytics" className="text-ui-fg-interactive hover:underline">
          Analytics → Sources &amp; campaigns
        </Link>{" "}
        (and their own discount code from Discounts) to see the visits and sales they bring.
      </Text>
    </div>
  )
}

function Feeds() {
  const store = (useStoreUrl() ?? "https://the64squares.in").replace(/\/$/, "")
  const feed = `${store}/feeds/products.xml`
  return (
    <div className="px-6 py-4">
      <Text size="small" className="text-ui-fg-subtle">
        One list of every product and option, with prices, stock and photos, updated hourly. Google and Meta read it to show your products in Google Shopping (free listings and ads) and in Facebook and Instagram shops and ads.
      </Text>
      <div className="mt-3 flex max-w-[640px] items-center gap-2 rounded-md border bg-ui-bg-subtle px-3 py-2">
        <Text size="small" className="min-w-0 flex-1 break-all font-mono text-[12px]">
          {feed}
        </Text>
        <Copy content={feed} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <Text size="small" weight="plus">
            Google Merchant Center
          </Text>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] text-ui-fg-subtle">
            <li>Open merchants.google.com and sign in with the store&apos;s Google account.</li>
            <li>Products → Add products → Add products from a file → enter the link above.</li>
            <li>Choose daily fetching. Country India, language English.</li>
          </ol>
        </div>
        <div>
          <Text size="small" weight="plus">
            Meta (Facebook and Instagram)
          </Text>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] text-ui-fg-subtle">
            <li>Open Commerce Manager → Catalogue → Data sources.</li>
            <li>Add items → Data feed → Use a URL → enter the link above.</li>
            <li>Choose a daily schedule, currency INR.</li>
          </ol>
        </div>
      </div>
      <Text size="xsmall" className="mt-4 text-ui-fg-muted">
        Products set to &ldquo;Hide from search engines&rdquo; in their SEO settings are left out.
      </Text>
    </div>
  )
}

const MarketingPage = () => {
  const [tab, setTab] = useState("emails")
  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading>Marketing</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Automatic emails, notifications, invites and product feeds. What shows on the website is switched in{" "}
          <Link to="/website/features" className="text-ui-fg-interactive hover:underline">
            Website → Site features
          </Link>
          .
        </Text>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List className="border-b px-6">
          <Tabs.Trigger value="emails">Automatic emails</Tabs.Trigger>
          <Tabs.Trigger value="push">Notifications</Tabs.Trigger>
          <Tabs.Trigger value="stock">Back in stock</Tabs.Trigger>
          <Tabs.Trigger value="invites">Invites</Tabs.Trigger>
          <Tabs.Trigger value="feeds">Google &amp; Meta feed</Tabs.Trigger>
        </Tabs.List>
        <div className="pb-4">
          <Tabs.Content value="emails">
            <Emails />
          </Tabs.Content>
          <Tabs.Content value="push">
            <Notifications />
          </Tabs.Content>
          <Tabs.Content value="stock">
            <Stock />
          </Tabs.Content>
          <Tabs.Content value="invites">
            <Invites />
          </Tabs.Content>
          <Tabs.Content value="feeds">
            <Feeds />
          </Tabs.Content>
        </div>
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Marketing", icon: PaperPlane, rank: 5 })

export default MarketingPage
