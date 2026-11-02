import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import defaultLogo from "../assets/stancil-logo.webp"
import { BACKEND_URL } from "../lib/sdk"

// Puts the Stancil logo (or the one uploaded under Branding) where Medusa's logo sits
// on the admin sign-in page. The widget slot is inside the form, so the logo is moved
// to the top of the page with a portal and Medusa's logo box is hidden.
const LoginLogo = () => {
  const anchor = useRef<HTMLSpanElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [logo, setLogo] = useState<string | null>(null)

  useLayoutEffect(() => {
    // The page column holds: Medusa's logo box, the heading, then the form with this widget.
    const column = anchor.current?.parentElement?.parentElement
    const medusaLogo = column?.firstElementChild as HTMLElement | null
    if (!column || !medusaLogo) {
      return
    }
    medusaLogo.style.display = "none"
    const el = document.createElement("div")
    column.insertBefore(el, medusaLogo)
    setSlot(el)
    return () => {
      el.remove()
      medusaLogo.style.display = ""
    }
  }, [])

  useEffect(() => {
    fetch(`${BACKEND_URL === "/" ? "" : BACKEND_URL}/brand`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { logo_url: string | null } | null) => setLogo(d?.logo_url || defaultLogo))
      .catch(() => setLogo(defaultLogo))
  }, [])

  return (
    <span ref={anchor} className="hidden">
      {slot &&
        createPortal(
          <div className="mb-4 flex h-[112px] items-center justify-center">
            {logo && <img src={logo} alt="Stancil" className="max-h-[112px] max-w-[240px] object-contain" />}
          </div>,
          slot
        )}
    </span>
  )
}

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default LoginLogo
