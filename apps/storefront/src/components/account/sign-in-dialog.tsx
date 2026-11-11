"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { SignIn } from "./sign-in"

// Signing in happens in a pop-up over the page you're on: any link to the account page (the
// header's account icon, "Sign in" buttons) opens it while you're signed out, and once you're
// in, the same page reloads, now signed in. Only mounted for signed-out visitors.

export const OPEN_SIGN_IN = "t64:sign-in"
// Opens the pop-up; false when it isn't on the page (then go to the account page instead).
export const openSignIn = () => {
  if (!document.documentElement.hasAttribute("data-sign-in")) return false
  window.dispatchEvent(new Event(OPEN_SIGN_IN))
  return true
}

export function SignInDialog({ google }: { google: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const path = usePathname()
  const [open, setOpen] = useState(false)
  // A fresh form each time it opens.
  const [round, setRound] = useState(0)

  useEffect(() => {
    // On the account page itself the full form is already showing.
    if (path === "/account") return
    const show = () => {
      setRound((r) => r + 1)
      setOpen(true)
    }
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank") return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || url.pathname !== "/account") return
      e.preventDefault()
      e.stopPropagation()
      show()
    }
    document.addEventListener("click", click, true)
    window.addEventListener(OPEN_SIGN_IN, show)
    document.documentElement.setAttribute("data-sign-in", "")
    return () => {
      document.documentElement.removeAttribute("data-sign-in")
      document.removeEventListener("click", click, true)
      window.removeEventListener(OPEN_SIGN_IN, show)
    }
  }, [path])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const here = typeof window === "undefined" ? path : `${location.pathname}${location.search}`

  return (
    <dialog
      ref={ref}
      aria-labelledby="sign-in-title"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === ref.current && setOpen(false)}
      className="sign-in-dialog m-auto w-[min(94vw,480px)] rounded-xl bg-white p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      {open && (
        <div className="relative max-h-[90dvh] overflow-y-auto px-6 pb-8 pt-10 sm:px-9">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-black/60 hover:bg-black/5 hover:text-black"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <SignIn key={round} google={google} next={here} inDialog onDone={() => window.location.reload()} />
        </div>
      )}
    </dialog>
  )
}
