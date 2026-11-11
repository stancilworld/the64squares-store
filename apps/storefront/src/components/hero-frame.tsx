"use client"

import { useEffect, useRef } from "react"

// Tells the hero how far down the page it starts (header, announcement bar), so it can size
// itself to the rest of the screen: everything in view on first load, on any screen.
export function HeroFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => el.style.setProperty("--hero-top", `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(document.body)
    window.addEventListener("resize", set)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", set)
    }
  }, [])
  return (
    <section ref={ref} aria-label="Welcome" className={className}>
      {children}
    </section>
  )
}
