"use client"

import { useState } from "react"

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
    } catch {
      setState("error")
    }
  }

  if (state === "done") {
    return <p className="mt-[45px] text-[20px]">You&apos;re on the list. See you in your inbox!</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-[45px] inline-flex h-[55px] items-center justify-center rounded-full bg-ink px-[43px] text-[18px] text-white hover:bg-black lg:w-[372px] lg:text-[20px]"
      >
        {label}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-[45px] flex max-w-[560px] flex-col gap-3 sm:flex-row">
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
        className="h-[55px] flex-1 rounded-full border-[1.5px] border-black px-6 text-[18px] outline-none"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="h-[55px] rounded-full bg-ink px-8 text-[18px] text-white hover:bg-black disabled:opacity-60"
      >
        {state === "sending" ? "..." : "Subscribe"}
      </button>
      {state === "error" && (
        <p className="text-[15px] text-red-700 sm:basis-full">That didn&apos;t work. Please check your email and try again.</p>
      )}
    </form>
  )
}
