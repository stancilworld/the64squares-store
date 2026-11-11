"use client"

import { useEffect } from "react"

// Clicking a link to the page you're already on (the logo or Home while on the homepage,
// say) scrolls smoothly back to the top instead of doing nothing.
export function SamePageTop() {
  useEffect(() => {
    const click = (e: MouseEvent) => {
      // (Next's links mark their clicks as handled, so defaultPrevented isn't checked.)
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || url.hash) return
      if (window.scrollY < 2) return
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
    }
    document.addEventListener("click", click)
    return () => document.removeEventListener("click", click)
  }, [])
  return null
}
