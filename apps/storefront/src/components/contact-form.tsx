"use client"

import { useState } from "react"
import type { ContactField, ContactPage } from "@/lib/types"
import { SendIcon } from "./icons"

// The Contact page form. Its questions are set in the admin (Website → Contact page).
type Value = string | boolean | string[]

const box =
  "w-full rounded-md border border-rule bg-white px-4 text-[15px] outline-none placeholder:text-muted focus:border-black lg:text-[16px]"

const empty = (f: ContactField): Value => (f.type === "checkbox" ? false : f.type === "checkboxes" ? [] : "")

export function ContactForm({ page }: { page: ContactPage }) {
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(page.fields.map((f) => [f.id, empty(f)])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle")
  const [message, setMessage] = useState("")
  const [trap, setTrap] = useState("")

  const set = (id: string, v: Value) => {
    setValues((s) => ({ ...s, [id]: v }))
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }))
    if (message) setMessage("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Quick check in the browser; the server checks again.
    const local: Record<string, string> = {}
    for (const f of page.fields) {
      const v = values[f.id]
      const blank = Array.isArray(v) ? !v.length : v === false || (typeof v === "string" && !v.trim())
      if (f.required && blank) local[f.id] = f.type === "checkbox" ? "Please tick this box." : "Please fill this in."
      else if (f.type === "email" && typeof v === "string" && v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) local[f.id] = "Please check this email address."
    }
    if (Object.keys(local).length) {
      setErrors(local)
      setMessage("Please check the highlighted fields.")
      document.getElementById(`cf-${Object.keys(local)[0]}`)?.focus()
      return
    }
    setState("sending")
    setMessage("")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: values, website: trap }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; errors?: Record<string, string> }
      if (res.ok && json.ok) {
        setState("sent")
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      setErrors(json.errors ?? {})
      setMessage(json.message || "We couldn't send that. Please try again.")
    } catch {
      setMessage("We couldn't send that. Please check your connection and try again.")
    }
    setState("idle")
  }

  if (state === "sent") {
    return (
      <div data-contact-sent className="flex min-h-[320px] flex-col items-start justify-center" role="status">
        <h2 className="font-display h-section">{page.success_title || "Thank you!"}</h2>
        <p className="mt-4 max-w-[520px] text-[17px] leading-[27px]">{page.success_text}</p>
        <button
          type="button"
          onClick={() => {
            setValues(Object.fromEntries(page.fields.map((f) => [f.id, empty(f)])))
            setState("idle")
          }}
          className="mt-8 btn btn-outline"
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      {page.form_title && <h2 className="font-display h-section">{page.form_title}</h2>}
      {/* Robots fill this in; people never see it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
        </label>
      </div>
      <div className="mt-[28px] grid grid-cols-1 gap-x-5 gap-y-[22px] md:grid-cols-2">
        {page.fields.map((f) => (
          <Question key={f.id} f={f} value={values[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />
        ))}
      </div>
      {message && (
        <p role="alert" className="mt-6 text-[15px] text-red-700">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-[30px] flex h-[52px] w-full items-center justify-center gap-3 rounded-md bg-black text-[17px] font-semibold text-white hover:bg-amber hover:text-black disabled:opacity-60 lg:h-[58px] lg:text-[18px]"
      >
        <SendIcon className="h-[20px] w-[20px]" />
        {state === "sending" ? "Sending…" : page.submit_label}
      </button>
    </form>
  )
}

function Question({ f, value, error, onChange }: { f: ContactField; value: Value; error?: string; onChange: (v: Value) => void }) {
  const id = `cf-${f.id}`
  const span = f.width === "half" ? "" : "md:col-span-2"
  const label = (
    <span className="px-1 text-[14px] font-medium lg:text-[15px]">
      {f.label}
      {f.required && <span aria-hidden="true"> *</span>}
    </span>
  )
  const note = error ? (
    <span id={`${id}-note`} className="px-1 text-[13px] text-red-700">
      {error}
    </span>
  ) : f.help && f.type !== "checkbox" ? (
    <span id={`${id}-note`} className="px-1 text-[13px] text-black/60">
      {f.help}
    </span>
  ) : null
  const aria = { "aria-invalid": !!error, "aria-describedby": error || f.help ? `${id}-note` : undefined, required: f.required }
  const red = error ? "border-red-600" : ""

  if (f.type === "checkbox") {
    return (
      <div className={`flex flex-col gap-[6px] ${span}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input id={id} type="checkbox" className="peer sr-only" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...aria} />
          <Tick on={value === true} error={!!error} square />
          <span className="text-[15px] leading-[22px]">
            {f.help || f.label}
            {f.required && <span aria-hidden="true"> *</span>}
          </span>
        </label>
        {error && <span className="px-1 text-[13px] text-red-700">{error}</span>}
      </div>
    )
  }

  if (f.type === "radio" || f.type === "checkboxes") {
    const many = f.type === "checkboxes"
    const list = Array.isArray(value) ? value : []
    return (
      <fieldset className={`flex flex-col gap-[10px] ${span}`} aria-describedby={error || f.help ? `${id}-note` : undefined}>
        <legend className="mb-[10px]">{label}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {f.options.map((o) => {
            const on = many ? list.includes(o) : value === o
            return (
              <label key={o} className="flex cursor-pointer items-center gap-[10px] text-[15px]">
                <input
                  type={many ? "checkbox" : "radio"}
                  name={id}
                  className="peer sr-only"
                  checked={on}
                  onChange={() => onChange(many ? (on ? list.filter((x) => x !== o) : [...list, o]) : o)}
                />
                <Tick on={on} error={!!error} square={many} />
                {o}
              </label>
            )
          })}
        </div>
        {note}
      </fieldset>
    )
  }

  return (
    <label className={`flex flex-col gap-[6px] ${span}`} htmlFor={id}>
      {label}
      {f.type === "textarea" ? (
        <textarea
          id={id}
          rows={5}
          placeholder={f.placeholder}
          value={String(value)}
          maxLength={5000}
          onChange={(e) => onChange(e.target.value)}
          className={`min-h-[140px] w-full rounded-md border border-black bg-white px-5 py-4 text-[15px] leading-[24px] outline-none placeholder:text-black/40 focus:ring-2 focus:ring-black/20 lg:text-[16px] ${red}`}
          {...aria}
        />
      ) : f.type === "select" ? (
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={`${box} h-[50px] appearance-none bg-[length:12px] bg-[right_20px_center] bg-no-repeat pr-12 ${value ? "" : "text-black/40"} ${red}`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E\")",
          }}
          {...aria}
        >
          <option value="">{f.placeholder || "Choose one…"}</option>
          {f.options.map((o) => (
            <option key={o} value={o} className="text-black">
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={f.type === "phone" ? "tel" : f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
          inputMode={f.type === "phone" ? "tel" : f.type === "number" ? "decimal" : undefined}
          autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : undefined}
          placeholder={f.placeholder}
          value={String(value)}
          maxLength={300}
          onChange={(e) => onChange(e.target.value)}
          className={`${box} h-[50px] ${red}`}
          {...aria}
        />
      )}
      {note}
    </label>
  )
}

// Round (pick one) or square (tick) marker in The 64 Squares black outline style.
function Tick({ on, error, square }: { on: boolean; error: boolean; square?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center border peer-focus-visible:ring-2 peer-focus-visible:ring-black/30 ${
        square ? "rounded-[6px]" : "rounded-full"
      } ${error ? "border-red-600" : "border-black"} ${on && square ? "bg-black" : "bg-white"}`}
    >
      {on &&
        (square ? (
          <svg viewBox="0 0 12 10" className="h-[10px] w-[12px]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 5l3.5 3.5L11 1.5" />
          </svg>
        ) : (
          <span className="h-[10px] w-[10px] rounded-full bg-black" />
        ))}
    </span>
  )
}
