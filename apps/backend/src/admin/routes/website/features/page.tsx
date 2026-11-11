import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { fromLocalInput, toLocalInput } from "../../../lib/dates"
import { ImageField } from "../../../lib/image-field"
import { sdk } from "../../../lib/sdk"

// Website → Site features: one switch for each promotional thing shoppers can see, and the
// words it shows. Switches save straight away; words save with each section's Save button.

type Features = {
  announcement: { enabled: boolean; text: string; link_url: string; link_label: string; style: "amber" | "ink"; starts_at: string | null; ends_at: string | null }
  popup: {
    enabled: boolean
    kind: "newsletter" | "offer"
    title: string
    body: string
    coupon_code: string
    image_url: string | null
    button_label: string
    button_url: string
    delay_seconds: number
    again_after_days: number
    pages: "all" | "home" | "shop"
  }
  countdowns: { enabled: boolean }
  reviews: { enabled: boolean; photos: boolean }
  newsletter_footer: { enabled: boolean; title: string; body: string }
  coupon_box: { enabled: boolean }
  code_badges: { enabled: boolean; code: string; text: string }
  back_in_stock: { enabled: boolean }
  referrals: { enabled: boolean; give_amount: number; get_amount: number; min_order: number }
  breadcrumbs: { enabled: boolean }
  faq: { enabled: boolean }
  share_buttons: { enabled: boolean }
  push: { enabled: boolean; prompt_after_seconds: number }
  business_profile: { enabled: boolean; url: string; label: string }
}
type Key = keyof Features

const ROWS: { key: Key; title: string; text: string }[] = [
  { key: "popup", title: "Pop-up", text: "A newsletter sign-up or an offer, shown once per visitor after a few seconds." },
  { key: "countdowns", title: "Sale countdowns", text: "\"Sale ends in 2d 4h\" timers on products whose sale has an end date." },
  { key: "reviews", title: "Reviews", text: "Star ratings on product cards and the reviews section on product pages." },
  { key: "newsletter_footer", title: "Newsletter sign-up in the footer", text: "A small email box at the bottom of every shop page." },
  { key: "coupon_box", title: "Coupon box at checkout", text: "Shoppers can type a discount code (make codes in Discounts)." },
  { key: "code_badges", title: "\"Use code\" badges", text: "A small badge on product pages telling shoppers about a code." },
  { key: "back_in_stock", title: "Back-in-stock alerts", text: "A \"Notify me\" button on sold-out products; they get an email when it's back." },
  { key: "referrals", title: "Invite a friend", text: "Customers share their code from their account page: the friend gets money off, and they get a thank-you code when the friend orders." },
  { key: "breadcrumbs", title: "Breadcrumbs", text: "Shop › Category › Product links at the top of product and category pages (also helps Google)." },
  { key: "faq", title: "FAQ sections", text: "Questions and answers on product pages, where you've added them (shown in Google too)." },
  { key: "share_buttons", title: "Share buttons", text: "Share on WhatsApp, Facebook and X on products, blog posts and news." },
  { key: "push", title: "Browser notifications", text: "Asks visitors if they'd like notifications for sales and tournaments." },
  { key: "business_profile", title: "Google Business Profile link", text: "A link to your Google listing in the footer (and your address details for Google)." },
]

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-y-1.5">
    <Label size="small">{label}</Label>
    {children}
  </div>
)

function Details({ k, value, onSave, saving }: { k: Key; value: Features[Key]; onSave: (v: Partial<Features[Key]>) => void; saving: boolean }) {
  const [v, setV] = useState<Record<string, unknown>>(value as Record<string, unknown>)
  useEffect(() => setV(value as Record<string, unknown>), [value])
  const set = (key: string, val: unknown) => setV((o) => ({ ...o, [key]: val }))
  const str = (key: string) => String(v[key] ?? "")
  const num = (key: string) => Number(v[key] ?? 0)
  const save = () => {
    const { enabled: _e, ...rest } = v
    onSave(rest as Partial<Features[Key]>)
  }

  let body: React.ReactNode = null
  if (k === "announcement")
    body = (
      <>
        <Row label="Text">
          <Input value={str("text")} maxLength={160} onChange={(e) => set("text", e.target.value)} />
        </Row>
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Link (optional)">
            <Input value={str("link_url")} placeholder="/shop" onChange={(e) => set("link_url", e.target.value)} />
          </Row>
          <Row label="Link words">
            <Input value={str("link_label")} placeholder="Shop now" onChange={(e) => set("link_label", e.target.value)} />
          </Row>
          <Row label="Starts (optional)">
            <Input type="datetime-local" value={toLocalInput(v.starts_at as string | null)} onChange={(e) => set("starts_at", fromLocalInput(e.target.value))} />
          </Row>
          <Row label="Ends (optional)">
            <Input type="datetime-local" value={toLocalInput(v.ends_at as string | null)} onChange={(e) => set("ends_at", fromLocalInput(e.target.value))} />
          </Row>
          <Row label="Colour">
            <Select value={str("style")} onValueChange={(x) => set("style", x)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="ink">Black</Select.Item>
                <Select.Item value="amber">Yellow</Select.Item>
              </Select.Content>
            </Select>
          </Row>
        </div>
      </>
    )
  if (k === "popup")
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Type">
            <Select value={str("kind")} onValueChange={(x) => set("kind", x)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="newsletter">Newsletter sign-up</Select.Item>
                <Select.Item value="offer">Offer with a button</Select.Item>
              </Select.Content>
            </Select>
          </Row>
          <Row label="Show on">
            <Select value={str("pages")} onValueChange={(x) => set("pages", x)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">Every shop page</Select.Item>
                <Select.Item value="home">Home page only</Select.Item>
                <Select.Item value="shop">Shop and product pages</Select.Item>
              </Select.Content>
            </Select>
          </Row>
        </div>
        <Row label="Heading">
          <Input value={str("title")} maxLength={80} onChange={(e) => set("title", e.target.value)} />
        </Row>
        <Row label="Text">
          <Textarea rows={2} value={str("body")} maxLength={300} onChange={(e) => set("body", e.target.value)} />
        </Row>
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Coupon code to show (optional)">
            <Input value={str("coupon_code")} placeholder="WELCOME10" onChange={(e) => set("coupon_code", e.target.value.toUpperCase())} />
          </Row>
          {str("kind") === "offer" && (
            <>
              <Row label="Button words">
                <Input value={str("button_label")} onChange={(e) => set("button_label", e.target.value)} />
              </Row>
              <Row label="Button link">
                <Input value={str("button_url")} onChange={(e) => set("button_url", e.target.value)} />
              </Row>
            </>
          )}
          <Row label="Show after (seconds)">
            <Input type="number" min={0} max={600} value={num("delay_seconds")} onChange={(e) => set("delay_seconds", Number(e.target.value))} />
          </Row>
          <Row label="Show again after (days)">
            <Input type="number" min={0} max={365} value={num("again_after_days")} onChange={(e) => set("again_after_days", Number(e.target.value))} />
          </Row>
        </div>
        <ImageField label="Picture (optional)" allowVideo={false} value={(v.image_url as string | null) ?? null} onChange={(url) => set("image_url", url)} recommended={{ width: 800, height: 600, note: "Shown beside the text on computers, above it on phones." }} />
      </>
    )
  if (k === "reviews")
    body = (
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label size="small">Photos in reviews</Label>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Shoppers can add up to 3 photos to a review. Photos are checked with the review before it goes live.
          </Text>
        </div>
        <Switch checked={!!v.photos} onCheckedChange={(x) => set("photos", x)} />
      </div>
    )
  if (k === "newsletter_footer")
    body = (
      <>
        <Row label="Heading">
          <Input value={str("title")} onChange={(e) => set("title", e.target.value)} />
        </Row>
        <Row label="Text">
          <Input value={str("body")} onChange={(e) => set("body", e.target.value)} />
        </Row>
      </>
    )
  if (k === "code_badges")
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Code">
          <Input value={str("code")} placeholder="CHESS10" onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Row>
        <Row label="Badge words ({code} is replaced by the code)">
          <Input value={str("text")} onChange={(e) => set("text", e.target.value)} />
        </Row>
      </div>
    )
  if (k === "referrals")
    body = (
      <div className="grid gap-3 sm:grid-cols-3">
        <Row label="Friend gets (₹ off)">
          <Input type="number" min={0} value={num("give_amount")} onChange={(e) => set("give_amount", Number(e.target.value))} />
        </Row>
        <Row label="Customer gets (₹ thank-you code)">
          <Input type="number" min={0} value={num("get_amount")} onChange={(e) => set("get_amount", Number(e.target.value))} />
        </Row>
        <Row label="Minimum order (₹)">
          <Input type="number" min={0} value={num("min_order")} onChange={(e) => set("min_order", Number(e.target.value))} />
        </Row>
      </div>
    )
  if (k === "push")
    body = (
      <Row label="Ask after (seconds on the site)">
        <Input type="number" min={0} max={600} value={num("prompt_after_seconds")} onChange={(e) => set("prompt_after_seconds", Number(e.target.value))} />
      </Row>
    )
  if (k === "business_profile")
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Your Google Business Profile link">
          <Input value={str("url")} placeholder="https://g.page/r/…" onChange={(e) => set("url", e.target.value)} />
        </Row>
        <Row label="Link words">
          <Input value={str("label")} onChange={(e) => set("label", e.target.value)} />
        </Row>
      </div>
    )
  if (!body) return null
  return (
    <div className="mt-3 flex flex-col gap-y-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      {body}
      <div className="flex justify-end">
        <Button size="small" variant="secondary" isLoading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}

const FeaturesPage = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["site-features"], queryFn: () => sdk.client.fetch<{ features: Features }>("/admin/site-features") })
  const [open, setOpen] = useState<Key | null>(null)
  const save = useMutation({
    mutationFn: (body: Partial<Record<Key, unknown>>) => sdk.client.fetch<{ features: Features }>("/admin/site-features", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["site-features"], r)
      toast.success("Saved. The website shows the change within a minute.")
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })
  if (!data) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  const f = data.features
  const on = ROWS.filter((r) => f[r.key].enabled).length

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Heading level="h1">Site features</Heading>
          <Badge size="2xsmall" color="grey">
            {on} of {ROWS.length} on
          </Badge>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Switch promotional parts of the website on or off. Switching off only hides them; their settings stay saved. The announcement bar is in{" "}
          <Link to="/website/navigation" className="text-ui-fg-interactive hover:underline">
            Menu &amp; footer
          </Link>
          ; emails, notifications and feeds are in{" "}
          <Link to="/marketing" className="text-ui-fg-interactive hover:underline">
            Marketing
          </Link>
          .
        </Text>
      </div>
      {ROWS.map((r) => {
        const value = f[r.key]
        const editable = !["countdowns", "coupon_box", "back_in_stock", "breadcrumbs", "faq", "share_buttons"].includes(r.key)
        return (
          <div key={r.key} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Text size="small" weight="plus">
                  {r.title}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {r.text}
                </Text>
                {editable && (
                  <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)} className="txt-compact-small mt-1 text-ui-fg-interactive hover:underline">
                    {open === r.key ? "Close" : "Edit words and options"}
                  </button>
                )}
              </div>
              <Switch aria-label={r.title} checked={value.enabled} onCheckedChange={(x) => save.mutate({ [r.key]: { enabled: x } })} />
            </div>
            {open === r.key && <Details k={r.key} value={value} saving={save.isPending} onSave={(v) => save.mutate({ [r.key]: v })} />}
          </div>
        )
      })}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Site features", rank: 1 })

export default FeaturesPage
