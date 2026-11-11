"use client"

import { useId, useState } from "react"

// "Email me when it's back", under a sold-out option.
export function NotifyMe({ variantId }: { variantId: string }) {
  const id = useId()
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  if (state === "done") {
    return (
      <p className="mt-4 rounded-md bg-chalk px-4 py-3 text-[15px]" role="status">
        Done. We&apos;ll email you once when it&apos;s back in stock.
      </p>
    )
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const email = String(new FormData(e.currentTarget).get("email") ?? "")
        setState("sending")
        try {
          const res = await fetch("/api/stock-alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, variant_id: variantId }) })
          setState(res.ok ? "done" : "error")
        } catch {
          setState("error")
        }
      }}
      className="mt-4 rounded-md border border-rule p-4"
    >
      <label htmlFor={id} className="text-[15px] font-semibold">
        Email me when it&apos;s back
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email"
          className="h-[46px] min-w-0 flex-1 rounded-md border border-black/30 bg-white px-3 text-[15px] outline-none focus:border-black"
        />
        <button type="submit" disabled={state === "sending"} className="btn btn-solid h-[46px] disabled:opacity-60">
          {state === "sending" ? "Saving…" : "Notify me"}
        </button>
      </div>
      {state === "error" && <p className="mt-2 text-[14px] text-red-700">That didn&apos;t work. Please check your email and try again.</p>}
    </form>
  )
}
