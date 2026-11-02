"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { cancelMyTicket } from "@/lib/tournament-actions"

export function TicketActions({ code, canCancel }: { code: string; canCancel: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => window.print()} className="btn btn-outline">
          Print ticket
        </button>
        {canCancel && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="btn px-3 text-muted underline underline-offset-4 hover:text-black">
            Can&apos;t make it?
          </button>
        )}
      </div>
      {confirming && (
        <div className="rounded-md border border-rule bg-linen p-4">
          <p className="text-[15px]">Give up your place? Someone else can take it, and this ticket stops working.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await cancelMyTicket(code)
                  if (res.ok) {
                    setConfirming(false)
                    router.refresh()
                  } else {
                    setError(res.error ?? "Couldn't cancel.")
                  }
                })
              }
              className="btn btn-solid disabled:opacity-60"
            >
              {pending ? "Cancelling…" : "Yes, cancel my place"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn btn-outline">
              Keep my place
            </button>
          </div>
          {error && <p className="mt-2 text-[14px] text-love">{error}</p>}
        </div>
      )}
    </div>
  )
}
