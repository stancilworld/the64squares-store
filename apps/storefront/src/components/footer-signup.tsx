"use client"

import { useId, useState } from "react"
import { track } from "@/lib/tracking/engine"

export async function subscribe(email: string, source: string) {
  const res = await fetch("/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, source }),
  })
  if (res.ok) track("Lead")
  return res.ok
}

// "Get our emails" in the footer, on every page (Website → Site features → Newsletter in footer).
export function FooterSignup({ title, body }: { title: string; body: string }) {
  const id = useId()
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <div className="max-w-[520px]">
        <h2 className="text-[20px] font-extrabold tracking-tight text-white">{title || "Get our emails"}</h2>
        {body && <p className="mt-1 text-[15px] text-white/70">{body}</p>}
      </div>
      {state === "done" ? (
        <p className="text-[15px] text-white" role="status">
          You&apos;re subscribed. Look out for our next email.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const email = String(new FormData(e.currentTarget).get("email") ?? "")
            setState("sending")
            try {
              setState((await subscribe(email, "footer")) ? "done" : "error")
            } catch {
              setState("error")
            }
          }}
          className="flex w-full max-w-[460px] flex-col gap-2 sm:flex-row"
        >
          <label htmlFor={id} className="sr-only">
            Email
          </label>
          <input
            id={id}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Your email"
            className="h-[46px] min-w-0 flex-1 rounded-md border border-white/25 bg-white/5 px-4 text-[15px] text-white outline-none placeholder:text-white/45 focus:border-amber"
          />
          <button type="submit" disabled={state === "sending"} className="h-[46px] rounded-md bg-amber px-5 text-[15px] font-semibold text-black disabled:opacity-60">
            {state === "sending" ? "Subscribing…" : "Subscribe"}
          </button>
          {state === "error" && <p className="text-[14px] text-red-300 sm:basis-full">That didn&apos;t work. Please check your email and try again.</p>}
        </form>
      )}
    </div>
  )
}
