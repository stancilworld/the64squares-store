"use client"

import type { HttpTypes } from "@medusajs/types"
import { useEffect, useState } from "react"
import { applyCode, removeCode } from "@/lib/checkout"
import { CloseIcon } from "../icons"

type Cart = HttpTypes.StoreCart

// A code that came with a link (?code=… on any page, or a friend's referral link), kept for
// the visit and applied at checkout by itself.
export const SAVED_CODE = "t64:code"

// "Have a discount code?" in the order summary.
export function CouponBox({ cart, onCart }: { cart: Cart; onCart: (c: Cart) => void }) {
  const applied = (cart.promotions ?? []).filter((p) => p.code && !p.is_automatic)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (value: string, quiet = false) => {
    setBusy(true)
    setError(null)
    const res = await applyCode(value)
    setBusy(false)
    if (res.ok) {
      onCart(res.cart)
      setCode("")
      setOpen(false)
      try {
        sessionStorage.removeItem(SAVED_CODE)
      } catch {}
    } else if (!quiet) setError(res.error)
    else {
      // The saved code didn't fit this order: show it, so the shopper knows why.
      setOpen(true)
      setCode(value)
      setError(res.error)
    }
  }

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(SAVED_CODE)
    } catch {}
    if (!saved || applied.some((p) => p.code?.toUpperCase() === saved!.toUpperCase())) return
    const t = setTimeout(() => void apply(saved!, true), 0)
    return () => clearTimeout(t)
    // Once, when the checkout opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mt-5 border-t border-black/25 px-1 pt-4">
      {applied.map((p) => (
        <div key={p.id} className="mb-2 flex items-center justify-between gap-3 rounded-md bg-amber/25 px-3 py-2 text-[14px]">
          <span>
            Code <strong className="font-semibold tracking-wide">{p.code}</strong> applied
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const res = await removeCode(p.code!)
              setBusy(false)
              if (res.ok) onCart(res.cart)
              else setError(res.error)
            }}
            className="inline-flex items-center gap-1 text-[13px] underline underline-offset-2 disabled:opacity-50"
          >
            <CloseIcon className="h-[12px] w-[12px]" />
            Remove
          </button>
        </div>
      ))}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-medium underline underline-offset-2 lg:text-[15px]">
          {applied.length ? "Add another code" : "Have a discount code?"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void apply(code)
          }}
          className="flex gap-2"
        >
          <label htmlFor="discount-code" className="sr-only">
            Discount code
          </label>
          <input
            id="discount-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Discount code"
            aria-invalid={!!error}
            aria-describedby={error ? "discount-code-error" : undefined}
            className="h-[44px] min-w-0 flex-1 rounded-md border border-black/30 bg-white px-3 text-[15px] uppercase tracking-wide outline-none placeholder:normal-case placeholder:tracking-normal focus:border-black"
          />
          <button type="submit" disabled={busy || !code.trim()} className="h-[44px] rounded-md bg-black px-5 text-[14px] font-semibold text-white disabled:opacity-40">
            {busy ? "Checking…" : "Apply"}
          </button>
        </form>
      )}
      {error && (
        <p id="discount-code-error" role="alert" className="mt-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
