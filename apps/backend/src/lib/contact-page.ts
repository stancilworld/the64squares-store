import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// The Contact page (admin → Website → Contact page): the panel of ways to reach The 64 Squares on the
// left, and a form built in the admin on the right. Messages are saved (admin → Messages) and
// emailed to `notify_email`.

export const CONTACT_PAGE_KEY = "contact_page"

export const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "radio", "checkbox", "checkboxes", "date", "number"] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const WITH_OPTIONS: FieldType[] = ["select", "radio", "checkboxes"]

export type FormField = {
  id: string
  type: FieldType
  label: string
  placeholder: string
  help: string
  required: boolean
  options: string[]
  width: "full" | "half"
}

export const PANEL_TYPES = ["email", "phone", "whatsapp", "instagram", "hours", "address", "link", "text"] as const
export type PanelItem = {
  id: string
  type: (typeof PANEL_TYPES)[number]
  label: string
  value: string
  // WhatsApp and link: the words on the button. WhatsApp: the message typed in for them.
  button_label: string
  message: string
}

export type ContactPage = {
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

const item = (id: string, type: PanelItem["type"], label: string, value: string, extra: Partial<PanelItem> = {}): PanelItem => ({
  id,
  type,
  label,
  value,
  button_label: "",
  message: "",
  ...extra,
})
const field = (id: string, type: FieldType, label: string, extra: Partial<FormField> = {}): FormField => ({
  id,
  type,
  label,
  placeholder: "",
  help: "",
  required: false,
  options: [],
  width: "full",
  ...extra,
})

export const DEFAULT_CONTACT_PAGE: ContactPage = {
  title: "Say hello",
  intro: "Questions about an order, a chess set or a tournament? We'd love to hear from you.",
  panel_title: "We're here to help",
  panel: [
    item("p_email", "email", "Email us", "hello@the64squares.in"),
    item("p_phone", "phone", "Call us", ""),
    item("p_whatsapp", "whatsapp", "WhatsApp", "", { button_label: "Chat on WhatsApp", message: "Hi The 64 Squares! I have a question." }),
    item("p_instagram", "instagram", "Instagram", ""),
    item("p_hours", "hours", "When we're around", "Monday – Saturday: 10:00 AM – 7:00 PM IST\nSunday: closed"),
  ],
  form_title: "Send us a message",
  submit_label: "Send message",
  success_title: "Thank you!",
  success_text: "We've got your message and will reply within one working day.",
  fields: [
    field("f_name", "text", "Your name", { required: true, placeholder: "e.g. Priya Sharma" }),
    field("f_email", "email", "Email", { required: true, placeholder: "you@example.com", width: "half" }),
    field("f_phone", "phone", "Phone / WhatsApp", { placeholder: "+91 98765 43210", width: "half" }),
    field("f_topic", "select", "What's it about?", {
      required: true,
      options: ["An order I placed", "Delivery", "Returns & warranty", "Choosing a chess set", "Tournaments", "Bulk, club or school order", "Something else"],
    }),
    field("f_message", "textarea", "Message", { required: true, placeholder: "Tell us a little more…" }),
  ],
  notify_email: "hello@the64squares.in",
  send_copy: true,
}

export const resolveContactPage = (stored: Record<string, unknown> | null | undefined): ContactPage => ({
  ...DEFAULT_CONTACT_PAGE,
  ...((stored ?? {}) as Partial<ContactPage>),
})

export const loadContactPage = async (container: MedusaContainer) => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return resolveContactPage(await content.getSettingValue(CONTACT_PAGE_KEY))
}

// What the website gets (no notification address).
export const publicContactPage = (p: ContactPage) => {
  const { notify_email, send_copy, ...rest } = p
  void notify_email
  void send_copy
  return { ...rest, panel: p.panel.filter((i) => i.value.trim()) }
}

export type Answer = { id: string; label: string; type: FieldType; value: string }

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const PHONE = /^[+()\d\s-]{6,20}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Checks a submission against the form as it is now. Returns the answers in form order, or
// a message per field that needs fixing.
export const checkSubmission = (page: ContactPage, raw: Record<string, unknown>) => {
  const errors: Record<string, string> = {}
  const answers: Answer[] = []
  for (const f of page.fields) {
    const v = raw[f.id]
    let value = ""
    if (f.type === "checkboxes") {
      const list = (Array.isArray(v) ? v : []).map(String).filter((x) => f.options.includes(x))
      value = list.join(", ")
    } else if (f.type === "checkbox") {
      value = v === true || v === "true" || v === "on" ? "Yes" : ""
    } else {
      value = typeof v === "string" || typeof v === "number" ? String(v).trim() : ""
    }
    const max = f.type === "textarea" ? 5000 : 300
    if (value.length > max) value = value.slice(0, max)
    if (!value) {
      if (f.required) errors[f.id] = f.type === "checkbox" ? "Please tick this box." : "Please fill this in."
      answers.push({ id: f.id, label: f.label, type: f.type, value: f.type === "checkbox" ? "No" : "" })
      continue
    }
    if (f.type === "email" && !EMAIL.test(value)) errors[f.id] = "Please check this email address."
    if (f.type === "phone" && !PHONE.test(value)) errors[f.id] = "Please check this number."
    if (f.type === "date" && !DATE.test(value)) errors[f.id] = "Please pick a date."
    if (f.type === "number" && !Number.isFinite(Number(value))) errors[f.id] = "Please enter a number."
    if ((f.type === "select" || f.type === "radio") && !f.options.includes(value)) errors[f.id] = "Please choose one of the options."
    answers.push({ id: f.id, label: f.label, type: f.type, value })
  }
  const first = (t: FieldType) => answers.find((a) => a.type === t && a.value)?.value ?? null
  return {
    errors,
    answers,
    email: first("email"),
    phone: first("phone"),
    name: first("text"),
    topic: answers.find((a) => (a.type === "select" || a.type === "radio") && a.value)?.value ?? null,
  }
}
