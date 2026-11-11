"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import type { SiteFeatures } from "@/lib/data"
import { subscribe } from "./footer-signup"
import { CloseIcon } from "./icons"
import { Media } from "./media"

type Popup = SiteFeatures["popup"]

const SEEN = "t64:popup"
// Never over a purchase or the visitor's own pages.
const QUIET = /^\/(checkout|cart|account|order|login|register|reset-password)/

const keyOf = (p: Popup) => `${p.kind}|${p.title}|${p.coupon_code}`

// The pop-up from Website → Site features: an email sign-up or an offer, shown once after a
// few seconds, then not again for the number of days set there.
export function SitePopup({ popup }: { popup: Popup }) {
  const path = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  const emailId = useId()

  useEffect(() => {
    if (QUIET.test(path)) return
    if (popup.pages === "home" && path !== "/") return
    if (popup.pages === "shop" && !/^\/(shop|products)/.test(path)) return
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN) ?? "null") as { key: string; at: number } | null
      if (seen && seen.key === keyOf(popup) && Date.now() - seen.at < popup.again_after_days * 86_400_000) return
    } catch {}
    const t = setTimeout(() => {
      const d = dialog.current
      // Not over another open window (sign-in, picture viewer…).
      if (!d || d.open || document.querySelector("dialog[open]")) return
      d.showModal()
      try {
        localStorage.setItem(SEEN, JSON.stringify({ key: keyOf(popup), at: Date.now() }))
      } catch {}
    }, Math.max(3, popup.delay_seconds) * 1000)
    return () => clearTimeout(t)
  }, [path, popup])

  const close = () => dialog.current?.close()
  const keepCode = () => {
    try {
      if (popup.coupon_code) sessionStorage.setItem("t64:code", popup.coupon_code)
    } catch {}
  }
  const showCode = popup.coupon_code && (popup.kind === "offer" || state === "done")

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
      className="m-auto w-[min(92vw,720px)] overflow-hidden rounded-xl bg-white p-0 text-black shadow-2xl backdrop:bg-black/55"
    >
      <div className={popup.image_url ? "grid sm:grid-cols-[5fr_6fr]" : ""}>
        {popup.image_url && (
          <div className="relative hidden bg-chalk sm:block">
            <Media src={popup.image_url} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
        <div className="relative px-6 pb-7 pt-10 sm:px-8">
          <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5">
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
          <h2 id={titleId} className="font-display text-[28px] leading-[1.08] tracking-tight sm:text-[32px]">
            {popup.title || (popup.kind === "newsletter" ? "Join our chess club" : "A little something for you")}
          </h2>
          {popup.body && <p className="mt-3 text-[16px] leading-[1.55] text-black/75">{popup.body}</p>}

          {popup.kind === "newsletter" && state !== "done" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const email = String(new FormData(e.currentTarget).get("email") ?? "")
                setState("sending")
                try {
                  setState((await subscribe(email, "popup")) ? "done" : "error")
                } catch {
                  setState("error")
                }
              }}
              className="mt-5 flex flex-col gap-2"
            >
              <label htmlFor={emailId} className="sr-only">
                Email
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Your email"
                className="h-[48px] rounded-md border border-black/30 px-4 text-[16px] outline-none focus:border-black"
              />
              <button type="submit" disabled={state === "sending"} className="btn btn-solid w-full disabled:opacity-60">
                {state === "sending" ? "Subscribing…" : "Subscribe"}
              </button>
              {state === "error" && <p className="text-[14px] text-red-700">That didn&apos;t work. Please check your email and try again.</p>}
            </form>
          )}
          {popup.kind === "newsletter" && state === "done" && (
            <p className="mt-5 text-[16px] font-semibold" role="status">
              You&apos;re subscribed.{showCode ? " Here is your code:" : ""}
            </p>
          )}

          {showCode && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md border-2 border-dashed border-black/40 bg-amber/20 px-4 py-3">
              <span className="text-[20px] font-extrabold tracking-[0.08em]">{popup.coupon_code}</span>
              <button
                type="button"
                onClick={() => {
                  keepCode()
                  navigator.clipboard?.writeText(popup.coupon_code).then(
                    () => setCopied(true),
                    () => {}
                  )
                }}
                className="text-[14px] font-semibold underline underline-offset-2"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {showCode && <p className="mt-2 text-[13px] text-black/60">{popup.kind === "offer" ? "Copy it or tap the button below, and it’s added at checkout by itself." : "Copy it, and it’s added at checkout by itself."}</p>}

          {popup.kind === "offer" && (
            <Link
              href={popup.button_url || "/shop"}
              onClick={() => {
                keepCode()
                close()
              }}
              className="btn btn-solid mt-5 w-full"
            >
              {popup.button_label || "Shop now"}
            </Link>
          )}
          <button type="button" onClick={close} className="mt-3 w-full text-center text-[14px] text-black/60 underline underline-offset-2">
            No thanks
          </button>
        </div>
      </div>
    </dialog>
  )
}
