import { InformationCircleSolid, MagnifyingGlass } from "@medusajs/icons"
import { Alert, Badge, Button, Drawer, Heading, Input, Label, Switch, Text, Tooltip, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../sdk"
import { type Integration, type IntegrationState, type MarketingView, STATUS_BADGE, type Settings } from "./types"

type TextField = { kind: "text"; section: keyof Settings; key: string; label: string; placeholder: string; hint: string; clean?: (v: string) => string }
type SwitchField = { kind: "switch"; section: keyof Settings; key: string; label: string; hint: string }
type Field = TextField | SwitchField

type Def = {
  blurb: string
  where: string
  fields: Field[]
  options: Field[]
  secret?: { name: "META_CAPI_TOKEN" | "GA4_API_SECRET"; info: "meta_capi_token" | "ga4_api_secret"; label: string; hint: string; when?: (s: Settings) => boolean }
  test: string
}

const upper = (v: string) => v.trim().toUpperCase()

export const DEFS: Record<Integration, Def> = {
  meta_pixel: {
    blurb: "Facebook and Instagram ads: the Pixel on your website reports visits, product views, add to cart and orders.",
    where: "Meta Events Manager → Data sources → your Pixel. The Pixel ID is the long number under its name.",
    fields: [{ kind: "text", section: "meta_pixel", key: "pixel_id", label: "Pixel ID", placeholder: "123456789012345", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") }],
    options: [],
    test: "Opens your website in a new tab and checks the Pixel loads. No event is sent.",
  },
  meta_capi: {
    blurb: "Sends the same events from this server too, so Meta still counts orders when a browser blocks the Pixel. Matched to the Pixel's events so nothing counts twice.",
    where: "Meta Events Manager → your Pixel → Settings → Conversions API → Generate access token.",
    fields: [],
    options: [
      {
        kind: "text",
        section: "meta_capi",
        key: "test_event_code",
        label: "Test event code (optional)",
        placeholder: "TEST12345",
        hint: "From Meta Events Manager → Test events. While it's set, events only show in Test events: remove it when you're done.",
        clean: upper,
      },
      {
        kind: "switch",
        section: "meta_capi",
        key: "advanced_matching",
        label: "Send hashed customer details with orders",
        hint: "Email, phone, name, city and pincode, scrambled (SHA-256) before they leave the server. Helps Meta match orders to ads. Only for visitors who allowed marketing cookies.",
      },
    ],
    secret: { name: "META_CAPI_TOKEN", info: "meta_capi_token", label: "Access token", hint: "Starts with EAA… Kept encrypted on the server; never sent to the website." },
    test: "Checks the token works for your Pixel. With a test event code, also sends one test event.",
  },
  ga4: {
    blurb: "Google Analytics 4: visits, product views, cart, checkout and orders with their value, in Google Analytics' ecommerce reports.",
    where: "Google Analytics → Admin → Data streams → your website. The Measurement ID starts with G-.",
    fields: [{ kind: "text", section: "ga4", key: "measurement_id", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", hint: "Starts with G-.", clean: upper }],
    options: [
      {
        kind: "switch",
        section: "ga4",
        key: "server_enabled",
        label: "Send orders, refunds and sign-ups from the server",
        hint: "More accurate (ad blockers can't stop it) and adds refunds. Needs a Measurement Protocol API secret. When on, the website no longer sends the order itself, so it's counted once.",
      },
    ],
    secret: {
      name: "GA4_API_SECRET",
      info: "ga4_api_secret",
      label: "Measurement Protocol API secret",
      hint: "Google Analytics → Admin → Data streams → your website → Measurement Protocol API secrets → Create.",
      when: (s) => s.ga4.server_enabled,
    },
    test: "Opens your website in a new tab and checks Google Analytics loads. With the server option, Google first checks a test order.",
  },
  google_ads: {
    blurb: "Counts orders (and contact messages) as conversions for your Google Ads campaigns, with their value. Enhanced conversions improve the match.",
    where: "Google Ads → Goals → Conversions → your conversion action → Tag setup → Use Google tag. You need the Conversion ID (AW-…) and the label after the slash.",
    fields: [
      { kind: "text", section: "google_ads", key: "conversion_id", label: "Conversion ID", placeholder: "AW-123456789", hint: "Starts with AW-.", clean: upper },
      { kind: "text", section: "google_ads", key: "purchase_label", label: "Purchase conversion label", placeholder: "AbC-D_efG-h12_34-567", hint: "The part after the slash in send_to: 'AW-123456789/…'.", clean: (v) => v.trim() },
      { kind: "text", section: "google_ads", key: "lead_label", label: "Lead conversion label (optional)", placeholder: "", hint: "For contact messages and newsletter sign-ups, if you made a separate conversion action.", clean: (v) => v.trim() },
    ],
    options: [
      {
        kind: "switch",
        section: "google_ads",
        key: "enhanced_conversions",
        label: "Enhanced conversions",
        hint: "On the order page, the customer's email and phone are given to Google's tag, which scrambles them before sending. Turn on Enhanced conversions in Google Ads too.",
      },
    ],
    test: "Opens your website in a new tab and checks the Google tag loads.",
  },
  gtm: {
    blurb: "For an agency or developer who manages tags in Google Tag Manager. Every shop event is also pushed to the data layer in GA4's ecommerce format.",
    where: "Google Tag Manager → your container. The ID starts with GTM-.",
    fields: [{ kind: "text", section: "gtm", key: "container_id", label: "Container ID", placeholder: "GTM-XXXXXXX", hint: "Starts with GTM-.", clean: upper }],
    options: [],
    test: "Opens your website in a new tab and checks your container loads (a wrong ID fails here).",
  },
  clarity: {
    blurb: "Microsoft Clarity (free): heatmaps and recordings of how visitors use the shop. Key shop events are marked in the recordings.",
    where: "clarity.microsoft.com → your project → Settings → Overview. The Project ID is the short code.",
    fields: [{ kind: "text", section: "clarity", key: "project_id", label: "Project ID", placeholder: "abcd1234ef", hint: "Letters and numbers.", clean: (v) => v.trim().toLowerCase() }],
    options: [],
    test: "Opens your website in a new tab and checks Clarity loads.",
  },
}

export const GROUP_TRACKING: Integration[] = ["meta_pixel", "meta_capi", "ga4", "google_ads", "gtm", "clarity"]

const get = (s: Settings, f: Field) => (s[f.section] as Record<string, unknown>)[f.key]

const useMarketingMutation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => sdk.client.fetch<MarketingView>("/admin/marketing", { method: "POST", body }),
    onSuccess: (r) => qc.setQueryData(["marketing"], r),
  })
}

// A platform's initials in its own colour, so each card is recognisable at a glance.
const IDENTITY: Record<Integration, { initials: string; bg: string; maker: string }> = {
  meta_pixel: { initials: "Px", bg: "#0866FF", maker: "Meta" },
  meta_capi: { initials: "CA", bg: "#0A4FC4", maker: "Meta" },
  ga4: { initials: "GA", bg: "#E37400", maker: "Google" },
  google_ads: { initials: "Ad", bg: "#1A73E8", maker: "Google" },
  gtm: { initials: "TM", bg: "#246FDB", maker: "Google" },
  clarity: { initials: "Cl", bg: "#5C2D91", maker: "Microsoft" },
}

// Technical words, explained on hover.
const TERMS: Record<Integration, string> = {
  meta_pixel: "A small script from Meta that runs in the visitor's browser and reports what they do on the shop.",
  meta_capi: "Conversions API: the same events sent from this server straight to Meta, so ad blockers and phone privacy settings don't hide them.",
  ga4: "Google Analytics 4: Google's visitor statistics. The server option uses the Measurement Protocol, Google's way to send events from a server.",
  google_ads: "Tells Google Ads which visits ended in an order, so it can show your ads to similar people. Enhanced conversions add the customer's scrambled email.",
  gtm: "Google Tag Manager: a container where an agency adds and changes tags without changing the website.",
  clarity: "Free heatmaps and session recordings from Microsoft. Recordings hide what visitors type.",
}

// The integration cards, with a search box.
export function IntegrationCards({ view, onOpen }: { view: MarketingView; onOpen: (i: Integration) => void }) {
  const [q, setQ] = useState("")
  const shown = GROUP_TRACKING.filter((key) => {
    const st = view.integrations.find((x) => x.key === key)!
    const hay = `${st.label} ${IDENTITY[key].maker} ${DEFS[key].blurb} ${STATUS_BADGE[st.status].label}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  return (
    <div className="px-6 py-4">
      <div className="relative mb-3 max-w-[320px]">
        <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-ui-fg-muted" />
        <Input size="small" className="pl-8" placeholder="Search integrations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search integrations" />
      </div>
      {!shown.length && (
        <Text size="small" className="text-ui-fg-subtle">
          No integration matches “{q}”.
        </Text>
      )}
    <div className="grid gap-3 md:grid-cols-2">
      {shown.map((key) => {
        const st = view.integrations.find((x) => x.key === key)!
        const badge = STATUS_BADGE[st.status]
        const id = IDENTITY[key]
        return (
          <button
            key={key}
            type="button"
            onClick={() => onOpen(key)}
            className="flex flex-col items-start gap-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-4 text-left transition-colors hover:bg-ui-bg-base-hover"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white" style={{ background: id.bg }}>
                  {id.initials}
                </span>
                <span>
                  <Text weight="plus" className="flex items-center gap-1">
                    {st.label}
                    <Tooltip content={TERMS[key]} maxWidth={280}>
                      <span tabIndex={0} aria-label={TERMS[key]} className="inline-flex text-ui-fg-muted" onClick={(e) => e.stopPropagation()}>
                        <InformationCircleSolid />
                      </span>
                    </Tooltip>
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {id.maker}
                  </Text>
                </span>
              </span>
              <Badge size="2xsmall" color={badge.color}>
                {badge.label}
              </Badge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {DEFS[key].blurb}
            </Text>
            <Text size="small" className={st.status === "error" ? "text-ui-fg-error" : "text-ui-fg-muted"}>
              {st.message}
            </Text>
            <span className="mt-1 text-ui-fg-interactive txt-compact-small-plus">{st.status === "not_connected" ? "Set up" : "Manage"}</span>
          </button>
        )
      })}
    </div>
    </div>
  )
}

// What isn't built yet: listed so it's clear, never shown as connected.
export function ComingNext() {
  const items = [
    ["Pinterest Tag and Conversions API", "Ads"],
    ["Snapchat Pixel and Conversions API", "Ads"],
    ["Microsoft Advertising (UET)", "Ads"],
    ["LinkedIn Insight Tag", "Ads"],
    ["WhatsApp Business (order updates, abandoned carts)", "Automation"],
    ["Brevo, Mailchimp or Klaviyo (customer sync, abandoned-cart emails)", "Automation"],
    ["Webhooks to other tools", "Automation"],
  ]
  return (
    <div className="px-6 py-4">
      <Heading level="h3">Coming next</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Not available yet. They will use the same events and Event Manager. TikTok isn&apos;t planned: it is blocked in India.
      </Text>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map(([name, kind]) => (
          <li key={name} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-ui-border-base px-3 py-2">
            <Text size="small">{name}</Text>
            <Badge size="2xsmall" color="grey">
              {kind}: not available yet
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Set up / manage one integration: ids, secret key, options, test, switch on.
export function IntegrationDrawer({ view, open, onClose }: { view: MarketingView; open: Integration | null; onClose: () => void }) {
  return (
    <Drawer open={!!open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[560px]">{open && <Wizard key={open} view={view} i={open} />}</Drawer.Content>
    </Drawer>
  )
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="flex gap-3 border-b border-ui-border-base px-6 py-5 last:border-b-0">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full txt-compact-xsmall-plus ${done ? "bg-ui-tag-green-bg text-ui-tag-green-text" : "bg-ui-bg-subtle text-ui-fg-subtle"}`}
      >
        {done ? "✓" : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Text weight="plus">{title}</Text>
        {children}
      </div>
    </section>
  )
}

function Wizard({ view, i }: { view: MarketingView; i: Integration }) {
  const def = DEFS[i]
  const st = view.integrations.find((x) => x.key === i) as IntegrationState
  const qc = useQueryClient()
  const save = useMarketingMutation()
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const f of [...def.fields, ...def.options]) init[`${f.section}.${f.key}`] = get(view.settings, f)
    return init
  })
  const [secret, setSecret] = useState("")
  const [password, setPassword] = useState("")
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [polling, setPolling] = useState(false)

  const settingsBody = () => {
    const body: Record<string, Record<string, unknown>> = {}
    for (const f of [...def.fields, ...def.options]) {
      body[f.section] = { ...(body[f.section] ?? {}), [f.key]: form[`${f.section}.${f.key}`] }
    }
    return body
  }

  const saveKey = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/service-keys", { method: "POST", body: { password, values: { [def.secret!.name]: secret } } }),
    onSuccess: async () => {
      setSecret("")
      setPassword("")
      toast.success("Key saved. It's kept encrypted on the server.")
      await qc.invalidateQueries({ queryKey: ["marketing"] })
    },
    onError: (e: Error) => toast.error("Key not saved", { description: e.message }),
  })

  const test = useMutation({
    mutationFn: async () => {
      // Opened now (a click), so the browser doesn't block it as a pop-up.
      const tab = def.secret && i === "meta_capi" ? null : window.open("about:blank", "_blank")
      try {
        await sdk.client.fetch<MarketingView>("/admin/marketing", { method: "POST", body: settingsBody() })
        const r = await sdk.client.fetch<MarketingView & { result: { ok: boolean; message: string; pending?: boolean; url?: string } }>("/admin/marketing/test", {
          method: "POST",
          body: { integration: i },
        })
        if (r.result.pending && r.result.url) {
          if (tab) tab.location.href = r.result.url
          else window.open(r.result.url, "_blank")
        } else tab?.close()
        return r
      } catch (e) {
        tab?.close()
        throw e
      }
    },
    onSuccess: (r) => {
      qc.setQueryData(["marketing"], r)
      setResult(r.result.pending ? null : r.result)
      setPolling(!!r.result.pending)
    },
    onError: (e: Error) => setResult({ ok: false, message: e.message }),
  })

  // While the website tab runs the test, check for its result.
  useEffect(() => {
    if (!polling) return
    const t = setInterval(async () => {
      const v = await sdk.client.fetch<MarketingView>("/admin/marketing")
      qc.setQueryData(["marketing"], v)
      const s = v.integrations.find((x) => x.key === i)
      if (s && s.status !== "testing") {
        setPolling(false)
        setResult(s.last_check ? { ok: s.last_check.ok, message: s.last_check.message } : { ok: false, message: s.message })
      }
    }, 2500)
    const stop = setTimeout(() => {
      setPolling(false)
      setResult({ ok: false, message: "No answer from the website tab. Make sure it opened (allow pop-ups for this page) and try again." })
    }, 120_000)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [polling, i, qc])

  const toggle = (on: boolean) =>
    save.mutate(
      { [i]: { enabled: on } },
      {
        onSuccess: () => toast.success(on ? "Switched on. The website picks it up within a few minutes." : "Switched off."),
        onError: (e: Error) => toast.error(e.message),
      }
    )

  const secretInfo = def.secret ? view.secrets[def.secret.info] : null
  const showSecret = !!def.secret && (!def.secret.when || def.secret.when({ ...view.settings, ga4: { ...view.settings.ga4, server_enabled: !!form["ga4.server_enabled"] } }))
  const pixelId = view.settings.meta_pixel.pixel_id
  let n = 0

  return (
    <>
      <Drawer.Header>
        <Drawer.Title>{st.label}</Drawer.Title>
        <Drawer.Description>{def.blurb}</Drawer.Description>
      </Drawer.Header>
      <Drawer.Body className="overflow-y-auto p-0">
        <div className="flex items-center gap-2 px-6 pt-4">
          <Badge size="2xsmall" color={STATUS_BADGE[st.status].color}>
            {STATUS_BADGE[st.status].label}
          </Badge>
          <Text size="small" className="text-ui-fg-subtle">
            {st.message}
          </Text>
        </div>

        {i === "meta_capi" ? (
          <Step n={++n} title="Pixel" done={!!pixelId}>
            <Text size="small" className="text-ui-fg-subtle">
              {pixelId ? `Uses the Pixel ID set in Meta Pixel: ${pixelId}.` : "Set up Meta Pixel first: the Conversions API sends to the same Pixel."}
            </Text>
          </Step>
        ) : (
          <Step n={++n} title="Your ID" done={def.fields.every((f) => f.kind !== "text" || !!form[`${f.section}.${f.key}`] || f.label.includes("optional"))}>
            <Text size="small" className="text-ui-fg-subtle">
              Where to find it: {def.where}
            </Text>
            {def.fields.map((f) => (
              <FieldInput key={f.key} f={f} value={form[`${f.section}.${f.key}`]} onChange={(v) => setForm({ ...form, [`${f.section}.${f.key}`]: v })} />
            ))}
          </Step>
        )}

        {showSecret && def.secret && (
          <Step n={++n} title={def.secret.label} done={!!secretInfo?.set}>
            {i === "meta_capi" && (
              <Text size="small" className="text-ui-fg-subtle">
                Where to find it: {def.where}
              </Text>
            )}
            <Text size="small" className="text-ui-fg-subtle">
              {secretInfo?.set ? `Saved (${secretInfo.preview}${secretInfo.source === "server" ? ", in the server settings" : ""}). Paste a new one to replace it.` : "Not saved yet."}{" "}
              {def.secret.hint}
            </Text>
            <div className="flex flex-col gap-2">
              <Input type="password" autoComplete="off" placeholder="Paste the key" value={secret} onChange={(e) => setSecret(e.target.value)} />
              <Input type="password" autoComplete="current-password" placeholder="Your admin password (main admin only)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div>
                <Button size="small" variant="secondary" disabled={!secret || !password} isLoading={saveKey.isPending} onClick={() => saveKey.mutate()}>
                  Save key
                </Button>
              </div>
            </div>
          </Step>
        )}

        {def.options.length > 0 && (
          <Step n={++n} title="Options" done>
            {def.options.map((f) => (
              <FieldInput key={f.key} f={f} value={form[`${f.section}.${f.key}`]} onChange={(v) => setForm({ ...form, [`${f.section}.${f.key}`]: v })} />
            ))}
          </Step>
        )}

        <Step n={++n} title="Test" done={st.tested}>
          <Text size="small" className="text-ui-fg-subtle">
            {def.test} Saves the details above first.
          </Text>
          <div>
            <Button size="small" isLoading={test.isPending || polling} onClick={() => test.mutate()}>
              {polling ? "Testing on your website…" : "Save and test"}
            </Button>
          </div>
          {result && (
            <Alert variant={result.ok ? "success" : "error"} dismissible={false}>
              {result.message}
            </Alert>
          )}
        </Step>

        <Step n={++n} title="Switch on" done={st.enabled && st.live}>
          <div className="flex items-start gap-3">
            <Switch id={`on-${i}`} className="mt-0.5 shrink-0" checked={st.enabled} disabled={(!st.tested && !st.enabled) || save.isPending} onCheckedChange={toggle} />
            <div>
              <Label htmlFor={`on-${i}`} weight="plus">
                {st.enabled ? "On" : "Off"}
              </Label>
              <Text size="small" className="text-ui-fg-subtle">
                {st.tested ? "Runs on the website only for visitors who allow it in the cookie banner." : "Available once the test has passed."}
              </Text>
            </div>
          </div>
        </Step>
      </Drawer.Body>
      <Drawer.Footer>
        <Drawer.Close asChild>
          <Button size="small" variant="secondary">
            Close
          </Button>
        </Drawer.Close>
      </Drawer.Footer>
    </>
  )
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${f.section}-${f.key}`
  if (f.kind === "switch") {
    return (
      <div className="flex items-start gap-3">
        <Switch id={id} className="mt-0.5 shrink-0" checked={!!value} onCheckedChange={onChange} />
        <div>
          <Label htmlFor={id} weight="plus">
            {f.label}
          </Label>
          <Text size="small" className="text-ui-fg-subtle">
            {f.hint}
          </Text>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} weight="plus">
        {f.label}
      </Label>
      <Input id={id} value={String(value ?? "")} placeholder={f.placeholder} onChange={(e) => onChange(f.clean ? f.clean(e.target.value) : e.target.value)} />
      <Text size="small" className="text-ui-fg-subtle">
        {f.hint}
      </Text>
    </div>
  )
}
