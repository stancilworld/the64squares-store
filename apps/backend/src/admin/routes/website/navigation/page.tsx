import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownMini, ArrowUpMini, ArrowUpRightOnBox, BarsThree, XMarkMini } from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Select, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { sdk } from "../../../lib/sdk"
import { useStoreUrl } from "../../../lib/site"

type NavLink = { label: string; href: string; same_line?: boolean }
type Nav = {
  menu: {
    characters_label: string
    characters_show: boolean
    categories_label: string
    all_label: string
    about_label: string
    about_links: NavLink[]
    extra_links: NavLink[]
  }
  footer: {
    tagline: string
    col1_title: string
    col1_links: NavLink[]
    col2_title: string
    col2_links: NavLink[]
    socials: { facebook: string; instagram: string; linkedin: string; youtube: string; whatsapp: string }
  }
  announcement: {
    enabled: boolean
    text: string
    link_label: string
    href: string
    colour: "black" | "red" | "yellow" | "blue"
    starts_at: string | null
    ends_at: string | null
    dismissible: boolean
  }
}
type Response = { navigation: Nav; defaults: Nav }

const COLOURS: { value: Nav["announcement"]["colour"]; label: string; className: string }[] = [
  { value: "black", label: "Black", className: "bg-black text-white" },
  { value: "red", label: "Red", className: "bg-[#e53935] text-white" },
  { value: "yellow", label: "Yellow", className: "bg-[#f6c445] text-black" },
  { value: "blue", label: "Blue", className: "bg-[#7fb2e5] text-black" },
]

const validHref = (h: string) => h === "" || h.startsWith("/") || /^https?:\/\//i.test(h) || /^mailto:|^tel:/i.test(h)

// datetime-local works in local (India) time; the server stores ISO.
const toLocal = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h2">{title}</Heading>
          {hint && (
            <Text size="small" className="text-ui-fg-subtle">
              {hint}
            </Text>
          )}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-y-4 px-6 py-4">{children}</div>
    </Container>
  )
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

// An editable list of links: words + where it goes, reorder with arrows.
function LinkList({
  links,
  onChange,
  max,
  sameLine,
  addLabel = "Add link",
}: {
  links: NavLink[]
  onChange: (next: NavLink[]) => void
  max: number
  sameLine?: boolean
  addLabel?: string
}) {
  const set = (i: number, patch: Partial<NavLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= links.length) return
    const next = [...links]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-ui-bg-subtle p-2">
          <BarsThree className="text-ui-fg-muted" />
          <Input size="small" className="w-44" placeholder="Words shown" value={l.label} aria-label="Link words" onChange={(e) => set(i, { label: e.target.value })} />
          <Input
            size="small"
            className="min-w-[200px] flex-1"
            placeholder="/shop or https://…"
            list="nav-pages"
            value={l.href}
            aria-label="Link goes to"
            aria-invalid={!validHref(l.href) || !l.href}
            onChange={(e) => set(i, { href: e.target.value })}
          />
          {sameLine && i > 0 && (
            <label className="flex items-center gap-x-1.5 txt-compact-small text-ui-fg-subtle">
              <Checkbox checked={!!l.same_line} onCheckedChange={(v) => set(i, { same_line: v === true })} />
              Same line as above
            </label>
          )}
          <div className="ms-auto flex">
            <button type="button" aria-label="Move up" className="rounded p-1 hover:bg-ui-bg-base disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUpMini />
            </button>
            <button
              type="button"
              aria-label="Move down"
              className="rounded p-1 hover:bg-ui-bg-base disabled:opacity-30"
              disabled={i === links.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDownMini />
            </button>
            <button type="button" aria-label="Remove link" className="rounded p-1 text-ui-fg-error hover:bg-ui-bg-base" onClick={() => onChange(links.filter((_, j) => j !== i))}>
              <XMarkMini />
            </button>
          </div>
        </div>
      ))}
      <div>
        <Button size="small" variant="secondary" disabled={links.length >= max} onClick={() => onChange([...links, { label: "", href: "" }])}>
          {addLabel}
        </Button>
      </div>
    </div>
  )
}

const NavigationPage = () => {
  const qc = useQueryClient()
  const storeUrl = useStoreUrl()
  const { data } = useQuery({ queryKey: ["site-navigation"], queryFn: () => sdk.client.fetch<Response>("/admin/site-navigation") })
  const { data: cats } = useQuery({
    queryKey: ["nav-categories"],
    queryFn: () => sdk.client.fetch<{ product_categories: { name: string; handle: string }[] }>("/admin/product-categories", { query: { limit: 100, fields: "name,handle" } }),
  })
  const { data: pages } = useQuery({
    queryKey: ["nav-pages"],
    queryFn: () => sdk.client.fetch<{ pages: { title: string; handle: string }[] }>("/admin/pages").catch(() => ({ pages: [] })),
  })
  const [nav, setNav] = useState<Nav | null>(null)
  const [saved, setSaved] = useState("")
  useEffect(() => {
    if (data) {
      setNav(data.navigation)
      setSaved(JSON.stringify(data.navigation))
    }
  }, [data])
  const dirty = !!nav && JSON.stringify(nav) !== saved
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const suggestions = useMemo(
    () => [
      ["/shop", "Shop (all furniture)"],
      ["/characters", "Characters"],
      ["/about", "About us"],
      ["/blog", "Blog"],
      ["/contact", "Contact"],
      ["/list", "Wishlist"],
      ["/account", "Account"],
      ...(cats?.product_categories ?? []).map((c) => [`/shop?category=${c.handle}`, `Category: ${c.name}`]),
      ...(pages?.pages ?? []).map((p) => [`/help/${p.handle}`, `Help: ${p.title}`]),
    ],
    [cats, pages]
  )

  const save = useMutation({
    mutationFn: (body: Nav) => sdk.client.fetch<Response>("/admin/site-navigation", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["site-navigation"], r)
      toast.success("Saved. The website shows it within a minute.")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })

  if (!data || !nav) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  const d = data.defaults
  const m = nav.menu
  const f = nav.footer
  const a = nav.announcement
  const setMenu = (patch: Partial<Nav["menu"]>) => setNav({ ...nav, menu: { ...m, ...patch } })
  const setFooter = (patch: Partial<Nav["footer"]>) => setNav({ ...nav, footer: { ...f, ...patch } })
  const setAnn = (patch: Partial<Nav["announcement"]>) => setNav({ ...nav, announcement: { ...a, ...patch } })
  const allLinks = [...m.about_links, ...m.extra_links, ...f.col1_links, ...f.col2_links]
  const badLink = allLinks.some((l) => !l.label.trim() || !l.href.trim() || !validHref(l.href.trim())) || !validHref(a.href)
  const badSocial = Object.values(f.socials).some((s) => s && !/^https:\/\//i.test(s))
  const badDates = !!(a.starts_at && a.ends_at && new Date(a.ends_at) <= new Date(a.starts_at))
  const now = Date.now()
  const annState = !a.enabled
    ? "Off"
    : a.ends_at && new Date(a.ends_at).getTime() <= now
      ? "Ended"
      : a.starts_at && new Date(a.starts_at).getTime() > now
        ? "Scheduled"
        : "Showing"
  const colour = COLOURS.find((c) => c.value === a.colour) ?? COLOURS[0]

  return (
    <div className="flex flex-col gap-y-3 pb-20">
      <datalist id="nav-pages">
        {suggestions.map(([href, label]) => (
          <option key={href} value={href}>
            {label}
          </option>
        ))}
      </datalist>
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Menu &amp; footer</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The words and links at the top and bottom of every page, and the announcement strip. Links can be a page on the
            site (start typing to pick one) or a full web address.
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

      <Section
        title="Announcement bar"
        hint="A short message across the very top of every page, e.g. a sale or delivery news."
        action={
          <Badge size="2xsmall" color={annState === "Showing" ? "green" : annState === "Scheduled" ? "blue" : "grey"}>
            {annState}
          </Badge>
        }
      >
        <div className="flex items-center gap-x-3">
          <Switch checked={a.enabled} onCheckedChange={(v) => setAnn({ enabled: v })} aria-label="Show announcement bar" />
          <Text size="small">Show the announcement bar</Text>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <Field label="Message" htmlFor="ann-text">
            <Input id="ann-text" maxLength={160} placeholder="e.g. Diwali sale: 10% off everything this week" value={a.text} onChange={(e) => setAnn({ text: e.target.value })} />
          </Field>
          <Field label="Link words (optional)" htmlFor="ann-ll">
            <Input id="ann-ll" placeholder="e.g. Shop now" value={a.link_label} onChange={(e) => setAnn({ link_label: e.target.value })} />
          </Field>
          <Field label="Link goes to (optional)" htmlFor="ann-href">
            <Input id="ann-href" list="nav-pages" placeholder="/shop" aria-invalid={!validHref(a.href)} value={a.href} onChange={(e) => setAnn({ href: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="Colour">
            <Select value={a.colour} onValueChange={(v) => setAnn({ colour: v as Nav["announcement"]["colour"] })}>
              <Select.Trigger aria-label="Colour">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {COLOURS.map((c) => (
                  <Select.Item key={c.value} value={c.value}>
                    {c.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <Field label="Start showing (optional)" htmlFor="ann-start" hint="Leave empty to start now.">
            <Input id="ann-start" type="datetime-local" value={toLocal(a.starts_at)} onChange={(e) => setAnn({ starts_at: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Stop showing (optional)" htmlFor="ann-end" hint={badDates ? "Must be after the start." : "Leave empty to keep it up."}>
            <Input id="ann-end" type="datetime-local" aria-invalid={badDates} value={toLocal(a.ends_at)} onChange={(e) => setAnn({ ends_at: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Shoppers can close it">
            <div className="flex h-8 items-center">
              <Switch checked={a.dismissible} onCheckedChange={(v) => setAnn({ dismissible: v })} aria-label="Shoppers can close it" />
            </div>
          </Field>
        </div>
        {a.text.trim() && (
          <div>
            <Text size="xsmall" className="mb-1 text-ui-fg-subtle">
              Preview
            </Text>
            <div className={`rounded-md px-4 py-2 text-center txt-compact-small ${colour.className}`}>
              {a.text} {a.href && <span className="font-semibold underline">{a.link_label || "Learn more"}</span>}
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Top menu"
        hint="The words in the menu at the top of every page (and in the phone menu)."
        action={
          <Button size="small" variant="transparent" onClick={() => setNav({ ...nav, menu: d.menu })}>
            Reset to original
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Characters link" htmlFor="m-char">
            <div className="flex items-center gap-x-3">
              <Input id="m-char" value={m.characters_label} onChange={(e) => setMenu({ characters_label: e.target.value })} />
              <label className="flex shrink-0 items-center gap-x-2 txt-compact-small">
                <Switch checked={m.characters_show} onCheckedChange={(v) => setMenu({ characters_show: v })} aria-label="Show characters link" />
                Show
              </label>
            </div>
          </Field>
          <Field label="Categories menu" htmlFor="m-cat" hint="Its list comes from your product categories.">
            <Input id="m-cat" value={m.categories_label} onChange={(e) => setMenu({ categories_label: e.target.value })} />
          </Field>
          <Field label="First item in the categories list" htmlFor="m-all">
            <Input id="m-all" value={m.all_label} onChange={(e) => setMenu({ all_label: e.target.value })} />
          </Field>
          <Field label="About menu" htmlFor="m-about">
            <Input id="m-about" value={m.about_label} onChange={(e) => setMenu({ about_label: e.target.value })} />
          </Field>
        </div>
        <Field label="About menu links" hint="Remove all to hide the About menu.">
          <LinkList links={m.about_links} max={10} onChange={(about_links) => setMenu({ about_links })} />
        </Field>
        <Field label="Extra menu links" hint="Up to 4 extra words in the top menu, e.g. Sale or Gift cards.">
          <LinkList links={m.extra_links} max={4} addLabel="Add menu link" onChange={(extra_links) => setMenu({ extra_links })} />
        </Field>
      </Section>

      <Section
        title="Footer"
        hint="The black area at the bottom of every page."
        action={
          <Button size="small" variant="transparent" onClick={() => setNav({ ...nav, footer: d.footer })}>
            Reset to original
          </Button>
        }
      >
        <Field label="Line under the logo" htmlFor="f-tag">
          <Input id="f-tag" value={f.tagline} onChange={(e) => setFooter({ tagline: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-y-3">
            <Field label="First column title" htmlFor="f-c1" hint="Shown on laptops and computers.">
              <Input id="f-c1" value={f.col1_title} onChange={(e) => setFooter({ col1_title: e.target.value })} />
            </Field>
            <LinkList links={f.col1_links} max={12} sameLine onChange={(col1_links) => setFooter({ col1_links })} />
          </div>
          <div className="flex flex-col gap-y-3">
            <Field label="Second column title" htmlFor="f-c2" hint="Shown on every screen size.">
              <Input id="f-c2" value={f.col2_title} onChange={(e) => setFooter({ col2_title: e.target.value })} />
            </Field>
            <LinkList links={f.col2_links} max={12} sameLine onChange={(col2_links) => setFooter({ col2_links })} />
          </div>
        </div>
        <Field label="Social links" hint="Leave a box empty to hide that icon. WhatsApp: use https://wa.me/91XXXXXXXXXX">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(["facebook", "instagram", "linkedin", "youtube", "whatsapp"] as const).map((k) => (
              <Input
                key={k}
                size="small"
                placeholder={`${k[0].toUpperCase() + k.slice(1)} link`}
                aria-label={`${k} link`}
                aria-invalid={!!f.socials[k] && !/^https:\/\//i.test(f.socials[k])}
                value={f.socials[k]}
                onChange={(e) => setFooter({ socials: { ...f.socials, [k]: e.target.value.trim() } })}
              />
            ))}
          </div>
        </Field>
      </Section>

      <div className="sticky bottom-0 z-10">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-elevation-card-hover">
          <Text size="small" className={badLink || badSocial || badDates ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
            {badLink
              ? "Every link needs words and a place to go (starting with / or https://)."
              : badSocial
                ? "Social links must start with https://"
                : badDates
                  ? "The announcement's stop time must be after its start."
                  : dirty
                    ? "You have unsaved changes."
                    : "All changes saved."}
          </Text>
          <div className="flex gap-x-2">
            {dirty && (
              <Button size="small" variant="secondary" onClick={() => setNav(JSON.parse(saved))}>
                Undo changes
              </Button>
            )}
            <Button size="small" disabled={!dirty || badLink || badSocial || badDates} isLoading={save.isPending} onClick={() => save.mutate(nav)}>
              Save
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Menu & footer",
  rank: 6,
})

export default NavigationPage
