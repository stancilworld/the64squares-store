import { InformationCircleSolid, MagnifyingGlass } from "@medusajs/icons"
import { Alert, Badge, Button, Copy, Drawer, Input, Label, Switch, Text, Tooltip, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../sdk"
import { type Integration, type IntegrationState, type MarketingView, STATUS_BADGE, type SecretName, type Settings } from "./types"

type TextField = { kind: "text"; section: keyof Settings; key: string; label: string; placeholder: string; hint: string; clean?: (v: string) => string }
type SwitchField = { kind: "switch"; section: keyof Settings; key: string; label: string; hint: string }
type Field = TextField | SwitchField

type SecretDef = { info: SecretName; label: string; hint: string; when?: (form: Record<string, unknown>) => boolean }

type Def = {
  blurb: string
  where: string
  fields: Field[]
  options: Field[]
  secrets?: SecretDef[]
  // Extra help shown in the wizard (templates, webhook address...).
  help?: (view: MarketingView) => React.ReactNode
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
    secrets: [{ info: "meta", label: "Access token", hint: "Starts with EAA… Kept encrypted on the server; never sent to the website." }],
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
    secrets: [
      {
        info: "ga4",
        label: "Measurement Protocol API secret",
        hint: "Google Analytics → Admin → Data streams → your website → Measurement Protocol API secrets → Create.",
        when: (f) => !!f["ga4.server_enabled"],
      },
    ],
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
  pinterest: {
    blurb: "Pinterest ads: the Pinterest Tag reports product views, searches, add to cart and orders, and the optional server copy sends them from this server too.",
    where: "Pinterest Ads Manager → Conversions → Tag manager. The Tag ID is the long number. The ad account ID is in the address bar of Ads Manager.",
    fields: [{ kind: "text", section: "pinterest", key: "tag_id", label: "Tag ID", placeholder: "2612345678901", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") }],
    options: [
      { kind: "switch", section: "pinterest", key: "capi_enabled", label: "Also send from the server (API for Conversions)", hint: "Counts orders even when a browser blocks the tag. Matched to the tag's events so nothing counts twice." },
      { kind: "text", section: "pinterest", key: "ad_account_id", label: "Ad account ID (for the server copy)", placeholder: "549755885175", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") },
      { kind: "switch", section: "pinterest", key: "test_mode", label: "Test mode for the server copy", hint: "Pinterest checks the events but doesn't record them. Turn off when you're done testing." },
    ],
    secrets: [{ info: "pinterest", label: "Conversion access token", hint: "Pinterest Ads Manager → Conversions → Conversion access token → Generate new token.", when: (f) => !!f["pinterest.capi_enabled"] }],
    test: "With the server copy on, sends a test event in Pinterest's test mode. Then opens your website to check the tag loads.",
  },
  snapchat: {
    blurb: "Snapchat ads: the Snap Pixel reports visits, product views, cart, checkout and orders; the optional Conversions API sends them from this server too.",
    where: "Snapchat Ads Manager → Events Manager → your Pixel. The Pixel ID looks like 1a2b3c4d-1234-5678-9abc-123456789abc.",
    fields: [{ kind: "text", section: "snapchat", key: "pixel_id", label: "Pixel ID", placeholder: "1a2b3c4d-1234-5678-9abc-123456789abc", hint: "Letters, numbers and dashes.", clean: (v) => v.trim().toLowerCase() }],
    options: [{ kind: "switch", section: "snapchat", key: "capi_enabled", label: "Also send from the server (Conversions API)", hint: "Matched to the Pixel's events with the same event id, so nothing counts twice." }],
    secrets: [{ info: "snapchat", label: "Conversions API token", hint: "Snapchat Events Manager → your Pixel → Setup → Conversions API → Generate token.", when: (f) => !!f["snapchat.capi_enabled"] }],
    test: "With the server copy on, Snapchat validates a test event (not recorded). Then opens your website to check the Pixel loads.",
  },
  microsoft_ads: {
    blurb: "Microsoft Advertising (Bing, Yahoo and partner sites): the UET tag counts visits and conversions; the optional Conversions API sends orders from this server too.",
    where: "Microsoft Advertising → Tools → Conversion tracking → UET tag. The tag ID is the number shown for your tag.",
    fields: [{ kind: "text", section: "microsoft_ads", key: "tag_id", label: "UET tag ID", placeholder: "187654321", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") }],
    options: [{ kind: "switch", section: "microsoft_ads", key: "capi_enabled", label: "Also send from the server (Conversions API)", hint: "Sent only when there's an email, phone or Microsoft click id to match on." }],
    secrets: [{ info: "microsoft", label: "Conversions API token", hint: "Microsoft Advertising → UET tag → edit → Save and next → Use Conversions API → Copy token.", when: (f) => !!f["microsoft_ads.capi_enabled"] }],
    help: () => <>In Microsoft Advertising, create conversion goals of type &quot;Event&quot; with the action names purchase, add_to_cart, begin_checkout or generate_lead.</>,
    test: "With the server copy on, sends a test event marked \"consent denied\" (never used for ads). Then opens your website to check the tag loads.",
  },
  linkedin: {
    blurb: "LinkedIn ads: the Insight Tag reports visits; orders and leads are sent as conversions, from the browser and optionally from this server.",
    where: "Campaign Manager → Analyze → Insight Tag (Partner ID), and Analyze → Conversion tracking → your conversion → its ID.",
    fields: [
      { kind: "text", section: "linkedin", key: "partner_id", label: "Partner ID", placeholder: "1234567", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") },
      { kind: "text", section: "linkedin", key: "purchase_conversion_id", label: "Order conversion ID", placeholder: "12345678", hint: "A conversion for completed orders.", clean: (v) => v.replace(/\D/g, "") },
      { kind: "text", section: "linkedin", key: "lead_conversion_id", label: "Lead conversion ID (optional)", placeholder: "", hint: "For contact messages and newsletter sign-ups.", clean: (v) => v.replace(/\D/g, "") },
    ],
    options: [
      { kind: "switch", section: "linkedin", key: "capi_enabled", label: "Also send from the server (Conversions API)", hint: "The conversions must use the method \"Conversions API\" in Campaign Manager." },
      { kind: "text", section: "linkedin", key: "ad_account_id", label: "Ad account ID (for the server copy)", placeholder: "512345678", hint: "Campaign Manager → Account. Digits only.", clean: (v) => v.replace(/\D/g, "") },
    ],
    secrets: [{ info: "linkedin", label: "Access token", hint: "An OAuth token with the rw_conversions and r_ads scopes. LinkedIn tokens last 60 days: renew it here before it runs out.", when: (f) => !!f["linkedin.capi_enabled"] }],
    test: "With the server copy on, checks the token and that your conversion IDs exist in the ad account. Then opens your website to check the tag loads.",
  },
  whatsapp: {
    blurb: "WhatsApp messages from your business number: order confirmation, shipping update, and a reminder for checkouts left unfinished. Only to customers who tick \"Send me order updates on WhatsApp\" at checkout.",
    where: "Meta for Developers → your app → WhatsApp → API Setup. The Phone number ID is under your number (not the phone number itself).",
    fields: [
      { kind: "text", section: "whatsapp", key: "phone_number_id", label: "Phone number ID", placeholder: "106540352242922", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") },
      { kind: "text", section: "whatsapp", key: "language", label: "Template language code", placeholder: "en", hint: "As set on your templates, e.g. en, en_US or hi.", clean: (v) => v.trim() },
      { kind: "text", section: "whatsapp", key: "template_order", label: "Order confirmation template", placeholder: "order_confirmed", hint: "Body variables: {{1}} first name, {{2}} order number, {{3}} total.", clean: (v) => v.trim().toLowerCase() },
      { kind: "text", section: "whatsapp", key: "template_shipped", label: "Shipped template", placeholder: "order_shipped", hint: "Body variables: {{1}} first name, {{2}} order number, {{3}} tracking number or link.", clean: (v) => v.trim().toLowerCase() },
      { kind: "text", section: "whatsapp", key: "template_abandoned", label: "Unfinished checkout template", placeholder: "cart_reminder", hint: "Body variables: {{1}} first name, {{2}} link back to the cart. Marketing category in WhatsApp.", clean: (v) => v.trim().toLowerCase() },
      { kind: "text", section: "whatsapp", key: "template_tournament", label: "Tournament reminder template", placeholder: "tournament_reminder", hint: "Body variables: {{1}} first name, {{2}} tournament, {{3}} start time, {{4}} link. Utility category. Sent 24 hours, 1 hour and 10 minutes before the start.", clean: (v) => v.trim().toLowerCase() },
    ],
    options: [{ kind: "text", section: "whatsapp", key: "test_number", label: "Test number (optional)", placeholder: "+919876543210", hint: "The test sends WhatsApp's sample \"hello_world\" message here.", clean: (v) => v.replace(/[^\d+]/g, "") }],
    secrets: [
      { info: "whatsapp", label: "Access token", hint: "For live use, a permanent System User token (Business Settings → System users) with the whatsapp_business_messaging permission." },
      { info: "whatsapp_app_secret", label: "App secret", hint: "App settings → Basic → App secret. Lets the store check delivery updates really come from Meta." },
    ],
    help: (v) => (
      <div className="flex flex-col gap-1.5">
        <Text size="small" className="text-ui-fg-subtle">
          Templates are made and approved in WhatsApp Manager → Message templates. For delivery updates (delivered, read, failed in the Event Manager), add this webhook in Meta for Developers → WhatsApp → Configuration and subscribe to &quot;messages&quot;:
        </Text>
        <div className="flex items-center gap-2 rounded-md bg-ui-bg-subtle px-3 py-2 font-mono txt-compact-xsmall">
          <span className="min-w-0 flex-1 break-all">{v.whatsapp_webhook_url}</span>
          <Copy content={v.whatsapp_webhook_url} />
        </div>
        <div className="flex items-center gap-2 rounded-md bg-ui-bg-subtle px-3 py-2 font-mono txt-compact-xsmall">
          <span className="min-w-0 flex-1">Verify token: {v.whatsapp_verify_token}</span>
          <Copy content={v.whatsapp_verify_token} />
        </div>
      </div>
    ),
    test: "Checks the token and phone number with WhatsApp. With a test number, also sends WhatsApp's sample message to it.",
  },
  brevo: {
    blurb: "Brevo (formerly Sendinblue) for email: subscribers are added to your list, and orders, unfinished checkouts and shipping are sent as events to start your automations.",
    where: "Brevo → Contacts → Lists: the list ID is the number next to the list. API key: your name → SMTP & API → API keys.",
    fields: [{ kind: "text", section: "brevo", key: "list_id", label: "List ID", placeholder: "3", hint: "Digits only.", clean: (v) => v.replace(/\D/g, "") }],
    options: [],
    secrets: [{ info: "brevo", label: "API key", hint: "Starts with xkeysib-." }],
    help: () => <>Events sent: order_placed, cart_abandoned (with cart_url), order_shipped, subscribed. Build automations on them in Brevo → Automations. Only customers who agreed to marketing emails are sent.</>,
    test: "Checks the API key and that the list exists.",
  },
  mailchimp: {
    blurb: "Mailchimp: subscribers go to your audience; tags start customer journeys (\"abandoned-cart\" for unfinished checkouts, \"customer\" after an order, \"newsletter\" for sign-ups).",
    where: "Mailchimp → Audience → Settings → Audience name and defaults: the Audience ID. API key: Profile → Extras → API keys.",
    fields: [{ kind: "text", section: "mailchimp", key: "audience_id", label: "Audience ID", placeholder: "a1b2c3d4e5", hint: "Letters and numbers.", clean: (v) => v.trim().toLowerCase() }],
    options: [],
    secrets: [{ info: "mailchimp", label: "API key", hint: "Ends with your data centre, e.g. -us21." }],
    help: () => <>For reminder emails with a link back to the cart, add a text merge field with the tag CARTURL (Audience → Settings → Audience fields). Only customers who agreed to marketing emails are sent.</>,
    test: "Checks the API key and that the audience exists.",
  },
  klaviyo: {
    blurb: "Klaviyo: subscribers go to your list; Placed Order, Abandoned Cart (with the cart link) and Fulfilled Order events start your flows.",
    where: "Klaviyo → Lists & segments → your list → Settings: the List ID. API key: Settings → API keys → Create private API key.",
    fields: [{ kind: "text", section: "klaviyo", key: "list_id", label: "List ID", placeholder: "AbC123", hint: "Six letters and numbers.", clean: (v) => v.trim() }],
    options: [],
    secrets: [{ info: "klaviyo", label: "Private API key", hint: "Starts with pk_. Needs write access to Events, Profiles, Lists and Subscriptions." }],
    help: () => <>Only customers who agreed to marketing emails are sent.</>,
    test: "Checks the API key and that the list exists.",
  },
}

// Integrations with a tag on the website (their test opens the website).
const BROWSER: Integration[] = ["meta_pixel", "ga4", "google_ads", "gtm", "clarity", "pinterest", "snapchat", "microsoft_ads", "linkedin"]

export const GROUP_TRACKING: Integration[] = ["meta_pixel", "meta_capi", "ga4", "google_ads", "gtm", "clarity", "pinterest", "snapchat", "microsoft_ads", "linkedin"]
export const GROUP_MESSAGES: Integration[] = ["whatsapp", "brevo", "mailchimp", "klaviyo"]

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
  pinterest: { initials: "Pi", bg: "#C8102E", maker: "Pinterest" },
  snapchat: { initials: "Sn", bg: "#E5C800", maker: "Snap" },
  microsoft_ads: { initials: "MA", bg: "#00809D", maker: "Microsoft" },
  linkedin: { initials: "in", bg: "#0A66C2", maker: "LinkedIn" },
  whatsapp: { initials: "WA", bg: "#1DA851", maker: "Meta" },
  brevo: { initials: "Br", bg: "#0B996E", maker: "Brevo" },
  mailchimp: { initials: "Mc", bg: "#241C15", maker: "Intuit" },
  klaviyo: { initials: "Kl", bg: "#232426", maker: "Klaviyo" },
}

// Technical words, explained on hover.
const TERMS: Record<Integration, string> = {
  meta_pixel: "A small script from Meta that runs in the visitor's browser and reports what they do on the shop.",
  meta_capi: "Conversions API: the same events sent from this server straight to Meta, so ad blockers and phone privacy settings don't hide them.",
  ga4: "Google Analytics 4: Google's visitor statistics. The server option uses the Measurement Protocol, Google's way to send events from a server.",
  google_ads: "Tells Google Ads which visits ended in an order, so it can show your ads to similar people. Enhanced conversions add the customer's scrambled email.",
  gtm: "Google Tag Manager: a container where an agency adds and changes tags without changing the website.",
  clarity: "Free heatmaps and session recordings from Microsoft. Recordings hide what visitors type.",
  pinterest: "The Pinterest Tag is Pinterest's version of a pixel; the API for Conversions is its server copy.",
  snapchat: "The Snap Pixel runs in the browser; the Conversions API sends the same events from the server.",
  microsoft_ads: "UET (Universal Event Tracking) is Microsoft Advertising's tag for Bing and partner sites.",
  linkedin: "The Insight Tag runs in the browser; conversions are the actions you count (orders, leads) in Campaign Manager.",
  whatsapp: "The WhatsApp Business Platform (Cloud API) sends pre-approved message templates from your business number.",
  brevo: "An email marketing tool. Events trigger automations; contacts are added to a list.",
  mailchimp: "An email marketing tool. Tags on a contact can start a customer journey.",
  klaviyo: "An email and SMS marketing tool. Events (metrics) trigger flows.",
}

// The integration cards, with a search box.
export function IntegrationCards({ view, onOpen, group = GROUP_TRACKING, search = true }: { view: MarketingView; onOpen: (i: Integration) => void; group?: Integration[]; search?: boolean }) {
  const [q, setQ] = useState("")
  const shown = group.filter((key) => {
    const st = view.integrations.find((x) => x.key === key)!
    const hay = `${st.label} ${IDENTITY[key].maker} ${DEFS[key].blurb} ${STATUS_BADGE[st.status].label}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  return (
    <div className="px-6 py-4">
      <div className={`relative mb-3 max-w-[320px] ${search ? "" : "hidden"}`}>
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
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
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
    mutationFn: (sd: SecretDef) =>
      sdk.client.fetch("/admin/service-keys", { method: "POST", body: { password, values: { [view.secrets[sd.info].name]: secretValues[sd.info] } } }),
    onSuccess: async (_r, sd) => {
      setSecretValues({ ...secretValues, [sd.info]: "" })
      toast.success("Key saved. It's kept encrypted on the server.")
      await qc.invalidateQueries({ queryKey: ["marketing"] })
    },
    onError: (e: Error) => toast.error("Key not saved", { description: e.message }),
  })

  const test = useMutation({
    mutationFn: async () => {
      // Opened now (a click), so the browser doesn't block it as a pop-up.
      const tab = BROWSER.includes(i) ? window.open("about:blank", "_blank") : null
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

  const secrets = (def.secrets ?? []).filter((sd) => !sd.when || sd.when(form))
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

        {secrets.length > 0 && (
          <Step n={++n} title={secrets.length > 1 ? "Secret keys" : secrets[0].label} done={secrets.every((sd) => view.secrets[sd.info]?.set)}>
            {i === "meta_capi" && (
              <Text size="small" className="text-ui-fg-subtle">
                Where to find it: {def.where}
              </Text>
            )}
            <Text size="small" className="text-ui-fg-subtle">
              Only the main admin can save keys (with their password). They&apos;re kept encrypted on the server and never sent to the website.
            </Text>
            {secrets.map((sd) => {
              const info = view.secrets[sd.info]
              return (
                <div key={sd.info} className="flex flex-col gap-1.5">
                  <Label weight="plus">{sd.label}</Label>
                  <Text size="small" className="text-ui-fg-subtle">
                    {info?.set ? `Saved (${info.preview}${info.source === "server" ? ", in the server settings" : ""}). Paste a new one to replace it.` : "Not saved yet."} {sd.hint}
                  </Text>
                  <div className="flex gap-2">
                    <Input type="password" autoComplete="off" placeholder="Paste the key" value={secretValues[sd.info] ?? ""} onChange={(e) => setSecretValues({ ...secretValues, [sd.info]: e.target.value })} />
                    <Button size="small" variant="secondary" disabled={!secretValues[sd.info] || !password} isLoading={saveKey.isPending && saveKey.variables?.info === sd.info} onClick={() => saveKey.mutate(sd)}>
                      Save
                    </Button>
                  </div>
                </div>
              )
            })}
            <Input type="password" autoComplete="current-password" placeholder="Your admin password (main admin only)" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Step>
        )}

        {def.help && (
          <Step n={++n} title="Good to know" done>
            <div className="txt-small text-ui-fg-subtle">{def.help(view)}</div>
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
                {!st.tested
                  ? "Available once the test has passed."
                  : GROUP_MESSAGES.includes(i)
                    ? "Only for customers who ticked the box for it at checkout (or subscribed)."
                    : "Runs only for visitors who allow it in the cookie banner."}
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
