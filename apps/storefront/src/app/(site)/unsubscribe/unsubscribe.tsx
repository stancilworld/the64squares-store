"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

export function Unsubscribe() {
  const params = useSearchParams()
  const email = params.get("e") ?? ""
  const sig = params.get("s") ?? ""
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")

  if (!email || !sig) {
    return (
      <>
        <h1 className="font-display h-page">Stop emails</h1>
        <p className="mt-4 text-[17px] text-muted">Please use the &ldquo;Stop these emails&rdquo; link at the bottom of one of our emails.</p>
      </>
    )
  }
  if (state === "done") {
    return (
      <>
        <h1 className="font-display h-page">You won&apos;t get offers from us</h1>
        <p className="mt-4 text-[17px] text-muted">
          We&apos;ve stopped offers and reminders to {email}. You&apos;ll still get emails about your orders. Changed your mind? Sign up again at the bottom of any page.
        </p>
        <Link href="/" className="btn btn-outline mt-8">
          Back to the shop
        </Link>
      </>
    )
  }
  return (
    <>
      <h1 className="font-display h-page">Stop emails?</h1>
      <p className="mt-4 text-[17px] text-muted">
        We&apos;ll stop sending offers, reminders and news to <strong className="text-black">{email}</strong>. Emails about your orders still come.
      </p>
      <button
        type="button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending")
          try {
            const res = await fetch("/api/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, sig }) })
            setState(res.ok ? "done" : "error")
          } catch {
            setState("error")
          }
        }}
        className="btn btn-solid mt-8 disabled:opacity-60"
      >
        {state === "sending" ? "Stopping…" : "Stop these emails"}
      </button>
      {state === "error" && <p className="mt-4 text-[15px] text-red-700">That didn&apos;t work. The link may be incomplete; please open it again from the email.</p>}
    </>
  )
}
