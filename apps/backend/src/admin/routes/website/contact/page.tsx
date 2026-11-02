import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownMini, ArrowUpMini, Envelope, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../../lib/sdk"
import { LivePreview, PageActions, useLeaveWarning } from "../../../lib/site-preview"

type FieldType = "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "checkboxes" | "date" | "number"
type FormField = {
  id: string
  type: FieldType
  label: string
  placeholder: string
  help: string
  required: boolean
  options: string[]
  width: "full" | "half"
}
type PanelType = "email" | "phone" | "whatsapp" | "instagram" | "hours" | "address" | "link" | "text"
type PanelItem = { id: string; type: PanelType; label: string; value: string; button_label: string; message: string }
type Contact = {
  title: string
  intro: string
  panel_title: string
  panel: PanelItem[]
  form_title: string
  submit_label: string
  success_title: string
  success_text: string
  fields: FormField[]
  notify_email: string
  send_copy: boolean
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text (message)" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "select", label: "Drop-down (pick one)" },
  { value: "radio", label: "Choice buttons (pick one)" },
  { value: "checkboxes", label: "Tick boxes (pick any)" },
  { value: "checkbox", label: "Single tick box (e.g. I agree)" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
]
const WITH_OPTIONS: FieldType[] = ["select", "radio", "checkboxes"]

const PANEL_TYPES: { value: PanelType; label: string; placeholder: string; hint: string }[] = [
  { value: "email", label: "Email", placeholder: "hello@the64squares.in", hint: "Opens their email app." },
  { value: "phone", label: "Phone", placeholder: "+91 98765 43210", hint: "Tapping it calls on a phone." },
  { value: "whatsapp", label: "WhatsApp button", placeholder: "+91 98765 43210", hint: "Your WhatsApp number. Shows a green Chat button." },
  { value: "instagram", label: "Instagram", placeholder: "@the64squares.in or ", hint: "" },
  { value: "hours", label: "Opening hours", placeholder: "Monday – Saturday: 10 AM – 7 PM", hint: "Each line shows on its own line." },
  { value: "address", label: "Address", placeholder: "Street, city, PIN", hint: "Each line shows on its own line." },
  { value: "link", label: "Link button", placeholder: "/help/faqs or https://…", hint: "" },
  { value: "text", label: "Text", placeholder: "Anything else", hint: "" },
]

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`

const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
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

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label htmlFor={htmlFor} size="small">
        {label}
      </Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

function RowTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex">
      <button type="button" aria-label="Move up" className="rounded p-1 hover:bg-ui-bg-base-hover disabled:opacity-30" disabled={i === 0} onClick={() => onMove(-1)}>
        <ArrowUpMini />
      </button>
      <button type="button" aria-label="Move down" className="rounded p-1 hover:bg-ui-bg-base-hover disabled:opacity-30" disabled={i === n - 1} onClick={() => onMove(1)}>
        <ArrowDownMini />
      </button>
      <button type="button" aria-label="Remove" className="rounded p-1 text-ui-fg-error hover:bg-ui-bg-base-hover" onClick={onRemove}>
        <Trash />
      </button>
    </div>
  )
}

const PREVIEW_KEY = "t64_live_preview"

const ContactPageEditor = () => {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["contact-page"],
    queryFn: () => sdk.client.fetch<{ contact: Contact; defaults: Contact }>("/admin/contact-page"),
  })
  const [c, setC] = useState<Contact | null>(null)
  const [saved, setSaved] = useState("")
  const [version, setVersion] = useState(0)
  const [preview, setPreview] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_KEY) === "1"
    } catch {
      return false
    }
  })
  // Choices are typed one per line; kept as text while editing so blank lines don't jump.
  const [optionText, setOptionText] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data) {
      setC(data.contact)
      setSaved(JSON.stringify(data.contact))
      setOptionText(Object.fromEntries(data.contact.fields.map((f) => [f.id, f.options.join("\n")])))
    }
  }, [data])
  const dirty = !!c && JSON.stringify(c) !== saved
  useLeaveWarning(dirty)

  const save = useMutation({
    mutationFn: (body: Contact) => sdk.client.fetch<{ contact: Contact; defaults: Contact }>("/admin/contact-page", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["contact-page"], r)
      setVersion((v) => v + 1)
      toast.success("Saved. The website shows it within a minute.")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })

  if (!c || !data) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }

  const set = (patch: Partial<Contact>) => setC({ ...c, ...patch })
  const setItem = (i: number, patch: Partial<PanelItem>) => set({ panel: c.panel.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const setField = (i: number, patch: Partial<FormField>) => set({ fields: c.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  const problems: string[] = []
  c.fields.forEach((f) => {
    if (!f.label.trim()) problems.push("Every question needs a label.")
    if (WITH_OPTIONS.includes(f.type) && !f.options.length) problems.push(`"${f.label || "A question"}" needs at least one choice.`)
  })
  c.panel.forEach((p) => {
    if (p.type === "link" && p.value && !/^(https?:\/\/|\/|mailto:|tel:)/i.test(p.value)) problems.push(`The "${p.label || "link"}" link must start with / or https://`)
  })
  if (!c.title.trim()) problems.push("The page needs a title.")
  if (!c.submit_label.trim()) problems.push("The send button needs words.")
  if (c.notify_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.notify_email)) problems.push("Check the email address messages go to.")
  if (!c.fields.some((f) => f.type === "email")) problems.push("Add an Email address question, or you won't be able to reply.")
  const blocking = problems.filter((p) => !p.startsWith("Add an Email"))

  const togglePreview = () =>
    setPreview((p) => {
      try {
        localStorage.setItem(PREVIEW_KEY, p ? "0" : "1")
      } catch {
        // fine
      }
      return !p
    })

  const editor = (
    <div className="flex flex-col gap-y-3">
      <Section title="Page" hint="The heading and the line under it.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title" htmlFor="c-title">
            <Input id="c-title" value={c.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Line under the title" htmlFor="c-intro">
            <Textarea id="c-intro" rows={2} value={c.intro} onChange={(e) => set({ intro: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section
        title="Ways to reach you (left panel)"
        hint="Email, phone, WhatsApp, Instagram, opening hours and more. Leave a box empty to hide that line."
        action={
          <Select
            value=""
            onValueChange={(t) => {
              const def = PANEL_TYPES.find((p) => p.value === t)!
              set({
                panel: [
                  ...c.panel,
                  { id: newId("p"), type: t as PanelType, label: def.label, value: "", button_label: t === "whatsapp" ? "Chat on WhatsApp" : t === "link" ? "Open" : "", message: "" },
                ],
              })
            }}
          >
            <Select.Trigger className="w-40" aria-label="Add a line">
              <Select.Value placeholder="Add a line" />
            </Select.Trigger>
            <Select.Content>
              {PANEL_TYPES.map((p) => (
                <Select.Item key={p.value} value={p.value}>
                  {p.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        }
      >
        <Field label="Panel heading" htmlFor="c-ptitle">
          <Input id="c-ptitle" value={c.panel_title} onChange={(e) => set({ panel_title: e.target.value })} />
        </Field>
        {c.panel.map((p, i) => {
          const def = PANEL_TYPES.find((t) => t.value === p.type)!
          const multi = p.type === "hours" || p.type === "address" || p.type === "text"
          return (
            <div key={p.id} data-panel-item className="flex flex-col gap-3 rounded-lg bg-ui-bg-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge size="2xsmall">{def.label}</Badge>
                <RowTools i={i} n={c.panel.length} onMove={(d) => set({ panel: move(c.panel, i, d) })} onRemove={() => set({ panel: c.panel.filter((_, j) => j !== i) })} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
                <Field label="Small heading">
                  <Input size="small" aria-label={`${def.label} heading`} value={p.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                </Field>
                <Field label={p.type === "whatsapp" ? "WhatsApp number" : p.type === "link" ? "Link goes to" : "Shown"} hint={def.hint}>
                  {multi ? (
                    <Textarea rows={2} aria-label={`${def.label} value`} placeholder={def.placeholder} value={p.value} onChange={(e) => setItem(i, { value: e.target.value })} />
                  ) : (
                    <Input size="small" aria-label={`${def.label} value`} placeholder={def.placeholder} value={p.value} onChange={(e) => setItem(i, { value: e.target.value })} />
                  )}
                </Field>
              </div>
              {(p.type === "whatsapp" || p.type === "link") && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
                  <Field label="Button words">
                    <Input size="small" aria-label={`${def.label} button words`} value={p.button_label} onChange={(e) => setItem(i, { button_label: e.target.value })} />
                  </Field>
                  {p.type === "whatsapp" && (
                    <Field label="Message typed in for them (optional)">
                      <Input size="small" aria-label="WhatsApp starting message" value={p.message} onChange={(e) => setItem(i, { message: e.target.value })} />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Section>

      <Section
        title="Form (right side)"
        hint="The questions shoppers answer. Half-width questions sit side by side on computers."
        action={
          <Select
            value=""
            onValueChange={(t) => {
              const id = newId("f")
              const withOpts = WITH_OPTIONS.includes(t as FieldType)
              const label = FIELD_TYPES.find((x) => x.value === t)!.label.replace(/ \(.*\)$/, "")
              set({ fields: [...c.fields, { id, type: t as FieldType, label, placeholder: "", help: "", required: false, options: withOpts ? ["Option 1", "Option 2"] : [], width: "full" }] })
              setOptionText({ ...optionText, [id]: withOpts ? "Option 1\nOption 2" : "" })
            }}
          >
            <Select.Trigger className="w-44" aria-label="Add a question">
              <Select.Value placeholder="Add a question" />
            </Select.Trigger>
            <Select.Content>
              {FIELD_TYPES.map((t) => (
                <Select.Item key={t.value} value={t.value}>
                  {t.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Form heading" htmlFor="c-ftitle">
            <Input id="c-ftitle" value={c.form_title} onChange={(e) => set({ form_title: e.target.value })} />
          </Field>
          <Field label="Send button words" htmlFor="c-submit">
            <Input id="c-submit" value={c.submit_label} onChange={(e) => set({ submit_label: e.target.value })} />
          </Field>
        </div>
        {c.fields.map((f, i) => (
          <div key={f.id} data-form-field className="flex flex-col gap-3 rounded-lg bg-ui-bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" weight="plus">
                Question {i + 1}
              </Text>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-x-1.5 txt-compact-small">
                  <Switch checked={f.required} onCheckedChange={(v) => setField(i, { required: v })} aria-label={`${f.label} required`} />
                  Must answer
                </label>
                <RowTools
                  i={i}
                  n={c.fields.length}
                  onMove={(d) => set({ fields: move(c.fields, i, d) })}
                  onRemove={() => c.fields.length > 1 && set({ fields: c.fields.filter((_, j) => j !== i) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1.4fr_1fr]">
              <Field label="Question">
                <Input size="small" aria-label={`Question ${i + 1}`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
              </Field>
              <Field label="Answer type">
                <Select
                  size="small"
                  value={f.type}
                  onValueChange={(t) => {
                    const withOpts = WITH_OPTIONS.includes(t as FieldType)
                    const options = withOpts && !f.options.length ? ["Option 1", "Option 2"] : f.options
                    setField(i, { type: t as FieldType, options })
                    if (withOpts && !optionText[f.id]) setOptionText({ ...optionText, [f.id]: options.join("\n") })
                  }}
                >
                  <Select.Trigger aria-label={`Question ${i + 1} type`}>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {FIELD_TYPES.map((t) => (
                      <Select.Item key={t.value} value={t.value}>
                        {t.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Field>
              <Field label="Width">
                <Select size="small" value={f.width} onValueChange={(w) => setField(i, { width: w as "full" | "half" })}>
                  <Select.Trigger aria-label={`Question ${i + 1} width`}>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="full">Full width</Select.Item>
                    <Select.Item value="half">Half width</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {!["checkbox", "checkboxes", "radio", "date"].includes(f.type) && (
                <Field label="Example inside the box (optional)">
                  <Input size="small" value={f.placeholder} onChange={(e) => setField(i, { placeholder: e.target.value })} />
                </Field>
              )}
              <Field label={f.type === "checkbox" ? "Words next to the tick box" : "Small note under it (optional)"}>
                <Input size="small" value={f.help} onChange={(e) => setField(i, { help: e.target.value })} />
              </Field>
            </div>
            {WITH_OPTIONS.includes(f.type) && (
              <Field label="Choices (one per line)">
                <Textarea
                  rows={4}
                  aria-label={`Question ${i + 1} choices`}
                  value={optionText[f.id] ?? f.options.join("\n")}
                  onChange={(e) => {
                    setOptionText({ ...optionText, [f.id]: e.target.value })
                    setField(i, { options: [...new Set(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))].slice(0, 30) })
                  }}
                />
              </Field>
            )}
          </div>
        ))}
      </Section>

      <Section title="After sending" hint="What shoppers see, and where their message goes.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Thank-you heading" htmlFor="c-st">
            <Input id="c-st" value={c.success_title} onChange={(e) => set({ success_title: e.target.value })} />
          </Field>
          <Field label="Thank-you message" htmlFor="c-sx">
            <Textarea id="c-sx" rows={2} value={c.success_text} onChange={(e) => set({ success_text: e.target.value })} />
          </Field>
          <Field label="Email messages to" htmlFor="c-notify" hint="Every message is also saved under Messages in this admin. Press Reply in the email to answer the shopper.">
            <Input id="c-notify" type="email" value={c.notify_email} onChange={(e) => set({ notify_email: e.target.value.trim() })} />
          </Field>
          <Field label="Send the shopper a copy">
            <div className="flex h-8 items-center gap-x-2">
              <Switch checked={c.send_copy} onCheckedChange={(v) => set({ send_copy: v })} aria-label="Send the shopper a copy" />
              <Text size="small" className="text-ui-fg-subtle">
                A "We've got your message" email with what they sent.
              </Text>
            </div>
          </Field>
        </div>
      </Section>
    </div>
  )

  return (
    <div className="flex flex-col gap-y-3 pb-20">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="max-w-xl">
          <Heading level="h1">Contact page</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The ways to reach you on the left, and the message form on the right. Messages arrive by email and under{" "}
            <Link to="/messages" className="text-ui-fg-interactive hover:underline">
              Messages
            </Link>
            .
          </Text>
        </div>
        <PageActions path="/contact" preview={preview} onTogglePreview={togglePreview} />
      </Container>
      {preview ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {editor}
          <div className="xl:sticky xl:top-3 xl:self-start">
            <LivePreview path="/contact" version={version} />
          </div>
        </div>
      ) : (
        editor
      )}
      <div className="sticky bottom-0 z-10">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-elevation-card-hover">
          <Text size="small" className={blocking.length ? "text-ui-fg-error" : problems.length ? "text-ui-tag-orange-text" : "text-ui-fg-subtle"}>
            {problems[0] ?? (dirty ? "You have unsaved changes." : "All changes saved.")}
          </Text>
          <div className="flex gap-x-2">
            <Button size="small" variant="transparent" onClick={() => {
                setC({ ...data.defaults })
                setOptionText(Object.fromEntries(data.defaults.fields.map((f) => [f.id, f.options.join("\n")])))
              }}>
              Reset to original
            </Button>
            {dirty && (
              <Button size="small" variant="secondary" onClick={() => {
                  const back = JSON.parse(saved) as Contact
                  setC(back)
                  setOptionText(Object.fromEntries(back.fields.map((f) => [f.id, f.options.join("\n")])))
                }}>
                Undo changes
              </Button>
            )}
            <Button size="small" disabled={!dirty || blocking.length > 0} isLoading={save.isPending} onClick={() => save.mutate(c)}>
              Save
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Contact page",
  icon: Envelope,
  rank: 5,
})

export default ContactPageEditor
