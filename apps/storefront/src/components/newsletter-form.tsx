"use client"

import { useState } from "react"
import { track } from "@/lib/tracking/engine"

export function NewsletterForm({ label }: { label: string }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = new FormData(e.currentTarget).get("email")
    setState("sending")
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setState(res.ok ? "done" : "error")
      if (res.ok) track("Lead")
    } catch {
      setState("error")
    }
  }

  if (state === "done") {
    return <p className="mt-6 text-[16px]">You&apos;re subscribed. Look out for our next email.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-solid mt-6"
      >
        {label}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 flex max-w-[520px] flex-col gap-3 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">
        Email
      </label>
      <input
        id="newsletter-email"
        name="email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        placeholder="Your email"
        className="h-[48px] flex-1 rounded-md border border-rule bg-white px-4 text-[16px] outline-none focus:border-black"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="btn btn-solid disabled:opacity-60"
      >
        {state === "sending" ? "..." : "Subscribe"}
      </button>
      {state === "error" && (
        <p className="text-[15px] text-red-700 sm:basis-full">That didn&apos;t work. Please check your email and try again.</p>
      )}
    </form>
  )
}
