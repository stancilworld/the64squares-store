"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CloseIcon } from "./icons"

const ASKED = "t64:push-asked"
const QUIET = /^\/(checkout|cart|account|order|login|register|reset-password|unsubscribe)/

const keyBytes = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// "Get notified about new sets and tournaments": the website's own small card first, and the
// browser's permission question only after "Allow" (Website → Site features → Notifications).
export function PushPrompt({ afterSeconds }: { afterSeconds: number }) {
  const path = usePathname()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (QUIET.test(path) || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return
    if (Notification.permission !== "default") return
    try {
      const at = Number(localStorage.getItem(ASKED) ?? 0)
      if (Date.now() - at < 30 * 86_400_000) return
    } catch {}
    // After the wait, and once nothing else is in the way (the cookie choices, a pop-up).
    let poll: ReturnType<typeof setInterval> | undefined
    const t = setTimeout(() => {
      const check = () => {
        if (document.querySelector('dialog[open], [aria-label="Cookie choices"]')) return false
        setShow(true)
        return true
      }
      if (!check()) poll = setInterval(() => check() && clearInterval(poll), 3000)
    }, Math.max(5, afterSeconds) * 1000)
    return () => {
      clearTimeout(t)
      clearInterval(poll)
    }
  }, [path, afterSeconds])

  const later = () => {
    setShow(false)
    try {
      localStorage.setItem(ASKED, String(Date.now()))
    } catch {}
  }

  const allow = async () => {
    setBusy(true)
    try {
      const info = (await (await fetch("/api/push")).json()) as { enabled?: boolean; public_key?: string }
      if (!info.enabled || !info.public_key) return later()
      const reg = await navigator.serviceWorker.register("/push-sw.js")
      if ((await Notification.requestPermission()) !== "granted") return later()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.public_key) }))
      await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) })
    } catch {
      // Blocked or unsupported: nothing more to do.
    }
    later()
    setBusy(false)
  }

  if (!show) return null
  return (
    <div role="dialog" aria-labelledby="push-title" className="fixed bottom-4 left-4 right-4 z-50 max-w-[380px] rounded-lg border border-rule bg-white p-4 shadow-xl sm:right-auto">
      <button type="button" onClick={later} aria-label="Close" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full hover:bg-chalk">
        <CloseIcon className="h-[14px] w-[14px]" />
      </button>
      <p id="push-title" className="pr-6 text-[16px] font-semibold">
        Get a heads-up on new sets and tournaments?
      </p>
      <p className="mt-1 text-[14px] text-muted">A few notifications a month. Turn them off any time in your browser.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={allow} disabled={busy} className="btn btn-solid h-[40px] px-5 disabled:opacity-60">
          {busy ? "One moment…" : "Allow"}
        </button>
        <button type="button" onClick={later} className="btn btn-outline h-[40px] px-5">
          Not now
        </button>
      </div>
    </div>
  )
}
